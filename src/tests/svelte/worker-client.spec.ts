import type { SvelteWorkerPort } from '@/components/editor/svelte/worker-client'
import type { SvelteWorkerResponse } from '@/lib/svelte/contracts'
import { SvelteWorkerClient } from '@/components/editor/svelte/worker-client'
import { createDependencyFetchLifecycle } from '@/workers/svelte/dependency-lifecycle'
import { describe, expect, it } from 'vitest'

class FakeWorker implements SvelteWorkerPort {
  messages: unknown[] = []
  terminated = false
  #messageListener: ((event: MessageEvent<SvelteWorkerResponse>) => void) | null = null
  #errorListener: ((event: ErrorEvent) => void) | null = null

  addEventListener(type: 'message', listener: (event: MessageEvent<SvelteWorkerResponse>) => void): void
  addEventListener(type: 'error', listener: (event: ErrorEvent) => void): void
  addEventListener(type: 'message' | 'error', listener: ((event: MessageEvent<SvelteWorkerResponse>) => void) | ((event: ErrorEvent) => void)) {
    if (type === 'message')
      this.#messageListener = listener as (event: MessageEvent<SvelteWorkerResponse>) => void
    else
      this.#errorListener = listener as (event: ErrorEvent) => void
  }

  removeEventListener(type: 'message', listener: (event: MessageEvent<SvelteWorkerResponse>) => void): void
  removeEventListener(type: 'error', listener: (event: ErrorEvent) => void): void
  removeEventListener(type: 'message' | 'error', listener: ((event: MessageEvent<SvelteWorkerResponse>) => void) | ((event: ErrorEvent) => void)) {
    void listener
    if (type === 'message')
      this.#messageListener = null
    else
      this.#errorListener = null
  }

  postMessage(message: unknown) {
    this.messages.push(message)
  }

  terminate() {
    this.terminated = true
  }

  respond(response: SvelteWorkerResponse) {
    this.#messageListener?.({ data: response } as MessageEvent<SvelteWorkerResponse>)
  }

  fail(message: string) {
    this.#errorListener?.({ message } as ErrorEvent)
  }
}

function createClient() {
  const worker = new FakeWorker()
  const client = new SvelteWorkerClient({ createWorker: () => worker })
  return { client, worker }
}

describe('svelte Worker client', () => {
  it('creates the Worker only for the first request and terminates it on disposal', () => {
    let workerCount = 0
    const worker = new FakeWorker()
    const client = new SvelteWorkerClient({
      createWorker: () => {
        workerCount += 1
        return worker
      },
    })

    expect(workerCount).toBe(0)
    client.diagnose('<h1>Koala</h1>')
    client.build('<h1>Koala</h1>')
    expect(workerCount).toBe(1)

    client.dispose()
    expect(worker.terminated).toBe(true)
    expect(() => client.diagnose('<h1>later</h1>')).toThrow('has been disposed')
  })

  it('keeps only the latest diagnose result when responses arrive out of order', () => {
    const { client, worker } = createClient()
    const oldRequestId = client.diagnose('<h1>old</h1>')
    const currentRequestId = client.diagnose('<h1>current</h1>')

    worker.respond({
      type: 'diagnose-result',
      requestId: currentRequestId,
      diagnostics: [{ message: 'current warning', severity: 'warning', start: 0, end: 1 }],
    })
    worker.respond({
      type: 'diagnose-result',
      requestId: oldRequestId,
      diagnostics: [{ message: 'obsolete error', severity: 'error', start: 0, end: 1 }],
    })

    expect(client.state.diagnostics).toMatchObject({
      requestId: currentRequestId,
      diagnostics: [{ message: 'current warning' }],
    })
  })

  it('keeps only the latest build success, warning, or error result', () => {
    const { client, worker } = createClient()
    const oldSuccessRequestId = client.build('<h1>old success</h1>')
    const oldErrorRequestId = client.build('<h1>old error</h1>')
    const currentRequestId = client.build('<h1>current</h1>')

    worker.respond({
      type: 'build-success',
      requestId: currentRequestId,
      javascript: 'current()',
      css: '',
      warnings: [{ message: 'current warning', severity: 'warning', start: 0, end: 0 }],
      dependencies: [],
    })
    worker.respond({
      type: 'build-error',
      requestId: oldErrorRequestId,
      error: { message: 'obsolete error', severity: 'error', start: 0, end: 0 },
      warnings: [],
    })
    worker.respond({
      type: 'build-success',
      requestId: oldSuccessRequestId,
      javascript: 'old()',
      css: '',
      warnings: [{ message: 'obsolete warning', severity: 'warning', start: 0, end: 0 }],
      dependencies: [],
    })

    expect(client.state.build).toMatchObject({
      type: 'build-success',
      requestId: currentRequestId,
      warnings: [{ message: 'current warning' }],
    })
  })

  it('attributes an unrecoverable Worker error to only the latest request kind', () => {
    const { client, worker } = createClient()
    const diagnoseRequestId = client.diagnose('<h1>diagnose</h1>')
    const buildRequestId = client.build('<h1>build</h1>')

    worker.fail('worker crashed')

    expect(client.state.diagnostics).toBeNull()
    expect(client.state.build).toMatchObject({
      type: 'build-error',
      requestId: buildRequestId,
      error: { code: 'worker_failed', message: 'worker crashed' },
    })
    expect(diagnoseRequestId).toBeLessThan(buildRequestId)
  })

  it('aborts only superseded dependency fetches and all remaining fetches on disposal', () => {
    const lifecycle = createDependencyFetchLifecycle()
    const first = lifecycle.begin(1)
    const second = lifecycle.begin(2)
    const stale = lifecycle.begin(1)

    expect(first.aborted).toBe(true)
    expect(second.aborted).toBe(false)
    expect(stale.aborted).toBe(true)

    lifecycle.dispose()
    expect(second.aborted).toBe(true)
  })
})
