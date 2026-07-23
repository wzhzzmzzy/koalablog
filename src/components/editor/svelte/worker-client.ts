import type {
  SvelteBuildError,
  SvelteBuildSuccess,
  SvelteDiagnoseResult,
  SvelteWorkerRequest,
  SvelteWorkerResponse,
} from '@/lib/svelte/contracts'

export interface SvelteWorkerPort {
  addEventListener: {
    (type: 'message', listener: (event: MessageEvent<SvelteWorkerResponse>) => void): void
    (type: 'error', listener: (event: ErrorEvent) => void): void
  }
  removeEventListener: {
    (type: 'message', listener: (event: MessageEvent<SvelteWorkerResponse>) => void): void
    (type: 'error', listener: (event: ErrorEvent) => void): void
  }
  postMessage: (message: SvelteWorkerRequest) => void
  terminate: () => void
}

export interface SvelteWorkerClientState {
  diagnostics: SvelteDiagnoseResult | null
  build: SvelteBuildSuccess | SvelteBuildError | null
}

export interface SvelteWorkerClientOptions {
  createWorker?: () => SvelteWorkerPort
}

function createBrowserWorker(): SvelteWorkerPort {
  return new Worker(new URL('../../../workers/svelte/artifact.worker.ts', import.meta.url), {
    name: 'koala-svelte-artifact',
    type: 'module',
  })
}

export class SvelteWorkerClient {
  #createWorker: () => SvelteWorkerPort
  #worker: SvelteWorkerPort | null = null
  #disposed = false
  #latestRequestId = 0
  #latestDiagnoseRequestId = 0
  #latestBuildRequestId = 0
  #state: SvelteWorkerClientState = { diagnostics: null, build: null }

  constructor(options: SvelteWorkerClientOptions = {}) {
    this.#createWorker = options.createWorker ?? createBrowserWorker
  }

  get state(): SvelteWorkerClientState {
    return {
      diagnostics: this.#state.diagnostics,
      build: this.#state.build,
    }
  }

  diagnose(source: string) {
    const requestId = this.#nextRequestId()
    this.#latestDiagnoseRequestId = requestId
    this.#state.diagnostics = null
    this.#post({ type: 'diagnose', requestId, source })
    return requestId
  }

  build(source: string) {
    const requestId = this.#nextRequestId()
    this.#latestBuildRequestId = requestId
    this.#state.build = null
    this.#post({ type: 'build', requestId, source })
    return requestId
  }

  dispose() {
    if (this.#disposed)
      return
    this.#disposed = true
    if (!this.#worker)
      return
    this.#worker.removeEventListener('message', this.#onMessage)
    this.#worker.removeEventListener('error', this.#onError)
    this.#worker.terminate()
    this.#worker = null
  }

  #nextRequestId() {
    if (this.#disposed)
      throw new Error('Svelte Worker client has been disposed')
    this.#latestRequestId += 1
    return this.#latestRequestId
  }

  #post(message: SvelteWorkerRequest) {
    const worker = this.#ensureWorker()
    worker.postMessage(message)
  }

  #ensureWorker() {
    if (this.#worker)
      return this.#worker
    const worker = this.#createWorker()
    worker.addEventListener('message', this.#onMessage)
    worker.addEventListener('error', this.#onError)
    this.#worker = worker
    return worker
  }

  #onMessage = (event: MessageEvent<SvelteWorkerResponse>) => {
    const message = event.data
    if (message.type === 'diagnose-result') {
      if (message.requestId === this.#latestDiagnoseRequestId)
        this.#state.diagnostics = message
      return
    }
    if (message.requestId === this.#latestBuildRequestId)
      this.#state.build = message
  }

  #onError = (event: ErrorEvent) => {
    const message = event.message || 'Svelte Worker failed'
    const error = {
      code: 'worker_failed',
      end: 0,
      message,
      severity: 'error' as const,
      start: 0,
    }
    if (this.#latestBuildRequestId > this.#latestDiagnoseRequestId) {
      this.#state.build = {
        type: 'build-error',
        requestId: this.#latestBuildRequestId,
        error,
        warnings: [],
      }
      return
    }
    if (this.#latestDiagnoseRequestId > 0) {
      this.#state.diagnostics = {
        type: 'diagnose-result',
        requestId: this.#latestDiagnoseRequestId,
        diagnostics: [error],
      }
    }
  }
}
