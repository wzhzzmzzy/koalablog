import type { SvelteWorkerClientListener, SvelteWorkerClientState } from '@/components/editor/svelte/worker-client'
import { SvelteBuildController, type SvelteDiagnosticWorker } from '@/components/editor/svelte/build-controller.svelte'
import { describe, expect, it, vi } from 'vitest'

class FakeDiagnosticWorker implements SvelteDiagnosticWorker {
  requests: Array<{ requestId: number, source: string }> = []
  disposed = false
  #nextRequestId = 0
  #listener: SvelteWorkerClientListener | null = null

  diagnose(source: string) {
    const requestId = ++this.#nextRequestId
    this.requests.push({ requestId, source })
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

  respond(requestId: number, diagnostics: SvelteWorkerClientState['diagnostics']['diagnostics']) {
    this.#listener?.({
      diagnostics: { type: 'diagnose-result', requestId, diagnostics },
      build: null,
    })
  }
}

describe('svelte build controller diagnostics', () => {
  it('debounces only active Svelte buffers', () => {
    vi.useFakeTimers()
    const worker = new FakeDiagnosticWorker()
    const controller = new SvelteBuildController({ debounceMs: 300, worker })

    controller.diagnose({ fileId: 1, renderer: 'markdown', source: '# Memo', enabled: true })
    vi.advanceTimersByTime(300)
    expect(worker.requests).toEqual([])

    controller.diagnose({ fileId: 1, renderer: 'svelte', source: '<h1>Koala</h1>', enabled: true })
    vi.advanceTimersByTime(299)
    expect(worker.requests).toEqual([])
    vi.advanceTimersByTime(1)
    expect(worker.requests).toEqual([{ requestId: 1, source: '<h1>Koala</h1>' }])

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
})
