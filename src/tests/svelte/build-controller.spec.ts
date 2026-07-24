import type { SvelteWorkerClientListener, SvelteWorkerClientState } from '@/components/editor/svelte/worker-client'
import { SvelteBuildController, type SvelteBuildWorker } from '@/components/editor/svelte/build-controller.svelte'
import { describe, expect, it, vi } from 'vitest'

class FakeDiagnosticWorker implements SvelteBuildWorker {
  buildRequests: Array<{ requestId: number, source: string }> = []
  diagnoseRequests: Array<{ requestId: number, source: string }> = []
  disposed = false
  #nextRequestId = 0
  #listener: SvelteWorkerClientListener | null = null

  diagnose(source: string) {
    const requestId = ++this.#nextRequestId
    this.diagnoseRequests.push({ requestId, source })
    return requestId
  }

  build(source: string) {
    const requestId = ++this.#nextRequestId
    this.buildRequests.push({ requestId, source })
    return requestId
  }

  subscribe(listener: SvelteWorkerClientListener) {
    this.#listener = listener
    listener({ diagnostics: null, build: null })
    return () => {
      this.#listener = null
    }
  }

  dispose() {
    this.disposed = true
  }

  respond(requestId: number, diagnostics: NonNullable<SvelteWorkerClientState['diagnostics']>['diagnostics']) {
    this.#listener?.({
      diagnostics: { type: 'diagnose-result', requestId, diagnostics },
      build: null,
    })
  }

  respondBuild(build: NonNullable<SvelteWorkerClientState['build']>) {
    this.#listener?.({ diagnostics: null, build })
  }
}

describe('svelte build controller diagnostics', () => {
  it('debounces only active Svelte buffers', () => {
    vi.useFakeTimers()
    const worker = new FakeDiagnosticWorker()
    const controller = new SvelteBuildController({ debounceMs: 300, worker })

    controller.diagnose({ fileId: 1, renderer: 'markdown', source: '# Memo', enabled: true })
    vi.advanceTimersByTime(300)
    expect(worker.diagnoseRequests).toEqual([])

    controller.diagnose({ fileId: 1, renderer: 'svelte', source: '<h1>Koala</h1>', enabled: true })
    vi.advanceTimersByTime(299)
    expect(worker.diagnoseRequests).toEqual([])
    vi.advanceTimersByTime(1)
    expect(worker.diagnoseRequests).toEqual([{ requestId: 1, source: '<h1>Koala</h1>' }])

    controller.dispose()
    expect(worker.disposed).toBe(true)
    vi.useRealTimers()
  })

  it('maps current structured diagnostics without changing the Source buffer', () => {
    vi.useFakeTimers()
    const worker = new FakeDiagnosticWorker()
    const controller = new SvelteBuildController({ debounceMs: 0, worker })
    const source = '<svelte:head><title>nope</title></svelte:head>'

    controller.diagnose({ fileId: 1, renderer: 'svelte', source, enabled: true })
    vi.runAllTimers()
    worker.respond(1, [{
      code: 'svelte_head_unsupported',
      end: 13,
      message: '<svelte:head> is unsupported',
      severity: 'error',
      start: 0,
    }])

    expect(controller.diagnostics).toEqual({
      requestId: 1,
      diagnostics: [{
        from: 0,
        to: 13,
        source: 'svelte_head_unsupported',
        message: '<svelte:head> is unsupported',
        severity: 'error',
      }],
    })
    expect(source).toBe('<svelte:head><title>nope</title></svelte:head>')
    controller.dispose()
    vi.useRealTimers()
  })

  it('rejects a delayed result after a source change or File switch', () => {
    vi.useFakeTimers()
    const worker = new FakeDiagnosticWorker()
    const controller = new SvelteBuildController({ debounceMs: 0, worker })

    controller.diagnose({ fileId: 1, renderer: 'svelte', source: '<h1>old</h1>', enabled: true })
    vi.runAllTimers()
    controller.diagnose({ fileId: 2, renderer: 'markdown', source: '# Second', enabled: true })
    worker.respond(1, [{ end: 1, message: 'stale', severity: 'error', start: 0 }])

    expect(controller.diagnostics).toBeNull()
    controller.dispose()
    vi.useRealTimers()
  })

  it('builds on Preview open, debounces Preview-visible edits, and keeps hidden edits diagnostic-only', async () => {
    vi.useFakeTimers()
    const worker = new FakeDiagnosticWorker()
    const controller = new SvelteBuildController({
      debounceMs: 300,
      sourceHash: async (_renderer, source) => `hash:${source}`,
      worker,
    })
    const visible = { enabled: true, fileId: 1, renderer: 'svelte' as const, source: '<h1>Koala</h1>' }

    await controller.previewOpened(visible)
    expect(worker.buildRequests).toEqual([{ requestId: 1, source: '<h1>Koala</h1>' }])

    controller.previewChanged({ ...visible, source: '<h1>Changed</h1>' })
    vi.advanceTimersByTime(299)
    expect(worker.buildRequests).toHaveLength(1)
    vi.advanceTimersByTime(1)
    await Promise.resolve()
    expect(worker.buildRequests).toEqual([
      { requestId: 1, source: '<h1>Koala</h1>' },
      { requestId: 2, source: '<h1>Changed</h1>' },
    ])

    controller.previewClosed()
    controller.diagnose({ ...visible, source: '<h1>Hidden edit</h1>' })
    vi.runAllTimers()
    expect(worker.buildRequests).toHaveLength(2)
    expect(worker.diagnoseRequests).toEqual([{ requestId: 3, source: '<h1>Hidden edit</h1>' }])
    controller.dispose()
    vi.useRealTimers()
  })

  it('reuses only a saved Source response with the same Renderer and Source Hash', async () => {
    const worker = new FakeDiagnosticWorker()
    const controller = new SvelteBuildController({
      sourceHash: async (_renderer, source) => `hash:${source}`,
      worker,
    })
    const saved = { enabled: true, fileId: 1, renderer: 'svelte' as const, source: '<h1>Koala</h1>', sourceHash: 'server-hash' }

    await controller.saved(saved)
    worker.respondBuild({
      type: 'build-success',
      requestId: 1,
      javascript: 'artifact()',
      css: '',
      warnings: [],
      dependencies: [],
    })
    await controller.saved(saved)
    expect(worker.buildRequests).toEqual([{ requestId: 1, source: '<h1>Koala</h1>' }])

    await controller.saved({ ...saved, sourceHash: 'different-server-hash' })
    expect(worker.buildRequests).toEqual([
      { requestId: 1, source: '<h1>Koala</h1>' },
      { requestId: 2, source: '<h1>Koala</h1>' },
    ])
    controller.dispose()
  })

  it('surfaces a build failure after Source Save without throwing or clearing diagnostics', async () => {
    const worker = new FakeDiagnosticWorker()
    const controller = new SvelteBuildController({ worker })
    const saved = { enabled: true, fileId: 1, renderer: 'svelte' as const, source: '<h1>Koala</h1>', sourceHash: 'server-hash' }

    await expect(controller.saved(saved)).resolves.toBeUndefined()
    worker.respondBuild({
      type: 'build-error',
      requestId: 1,
      error: { end: 1, message: 'build failed', severity: 'error', start: 0 },
      warnings: [],
    })
    expect(controller.build).toMatchObject({ type: 'build-error', error: { message: 'build failed' } })
    expect(controller.diagnostics).toBeNull()
    controller.dispose()
  })
})
