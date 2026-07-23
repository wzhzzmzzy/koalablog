import type { RendererMode } from '@/lib/files/types'
import type { SvelteBuildError, SvelteBuildSuccess } from '@/lib/svelte/contracts'
import type { SvelteWorkerClientListener, SvelteWorkerClientState } from './worker-client'
import { calculateSourceHash } from '@/lib/files/source-hash'
import { mapSvelteDiagnostics, type TextEditorDiagnosticUpdate } from '../text-editor/diagnostics'
import { SvelteWorkerClient } from './worker-client'

export interface SvelteDiagnosticBuffer {
  fileId: number
  renderer: RendererMode
  source: string
  enabled: boolean
}

export interface SvelteBuildBuffer extends SvelteDiagnosticBuffer {
  sourceHash?: string
}

export interface SvelteBuildWorker {
  build: (source: string) => number
  diagnose: (source: string) => number
  subscribe: (listener: SvelteWorkerClientListener) => () => void
  dispose: () => void
}

export interface SvelteBuildControllerOptions {
  debounceMs?: number
  sourceHash?: (renderer: RendererMode, source: string) => Promise<string>
  worker?: SvelteBuildWorker
}

interface PendingDiagnostic {
  generation: number
  requestId: number
}

interface PendingBuild {
  cacheKey: string
  generation: number
  requestId: number
}

function cacheKey(renderer: RendererMode, sourceHash: string) {
  return `${renderer}:${sourceHash}`
}

export class SvelteBuildController {
  build = $state<SvelteBuildSuccess | SvelteBuildError | null>(null)
  diagnostics = $state<TextEditorDiagnosticUpdate | null>(null)

  #debounceMs: number
  #sourceHash: (renderer: RendererMode, source: string) => Promise<string>
  #worker: SvelteBuildWorker
  #unsubscribe: () => void
  #buildCache = new Map<string, SvelteBuildSuccess>()
  #buildGeneration = 0
  #buildTimer: ReturnType<typeof setTimeout> | undefined
  #diagnosticTimer: ReturnType<typeof setTimeout> | undefined
  #diagnosticGeneration = 0
  #pendingBuild: PendingBuild | null = null
  #pending: PendingDiagnostic | null = null
  #disposed = false

  constructor(options: SvelteBuildControllerOptions = {}) {
    this.#debounceMs = options.debounceMs ?? 350
    this.#sourceHash = options.sourceHash ?? calculateSourceHash
    this.#worker = options.worker ?? new SvelteWorkerClient()
    this.#unsubscribe = this.#worker.subscribe(this.#onWorkerState)
  }

  diagnose(buffer: SvelteDiagnosticBuffer) {
    if (this.#disposed)
      return
    this.#diagnosticGeneration += 1
    const generation = this.#diagnosticGeneration
    this.#pending = null
    this.diagnostics = null
    this.#clearDiagnosticTimer()

    if (!buffer.enabled || buffer.renderer !== 'svelte')
      return

    const source = buffer.source
    this.#diagnosticTimer = setTimeout(() => {
      if (this.#disposed || generation !== this.#diagnosticGeneration)
        return
      const requestId = this.#worker.diagnose(source)
      this.#pending = { generation, requestId }
    }, this.#debounceMs)
  }

  previewOpened(buffer: SvelteBuildBuffer) {
    return this.#requestBuild(buffer)
  }

  previewChanged(buffer: SvelteBuildBuffer) {
    this.#clearBuildTimer()
    const generation = ++this.#buildGeneration
    if (this.#disposed || !buffer.enabled || buffer.renderer !== 'svelte') {
      this.build = null
      return
    }
    this.#buildTimer = setTimeout(() => {
      if (this.#disposed || generation !== this.#buildGeneration)
        return
      void this.#requestBuild(buffer)
    }, this.#debounceMs)
  }

  saved(buffer: SvelteBuildBuffer & { sourceHash: string }) {
    return this.#requestBuild(buffer)
  }

  previewClosed() {
    this.#buildGeneration += 1
    this.#pendingBuild = null
    this.#clearBuildTimer()
  }

  dispose() {
    if (this.#disposed)
      return
    this.#disposed = true
    this.#buildGeneration += 1
    this.#diagnosticGeneration += 1
    this.#pending = null
    this.#pendingBuild = null
    this.#clearBuildTimer()
    this.#clearDiagnosticTimer()
    this.#unsubscribe()
    this.#worker.dispose()
  }

  #onWorkerState = (state: SvelteWorkerClientState) => {
    const result = state.diagnostics
    const pending = this.#pending
    if (result && pending
      && pending.generation === this.#diagnosticGeneration
      && result.requestId === pending.requestId) {
      this.diagnostics = mapSvelteDiagnostics(result.requestId, result.diagnostics)
    }

    const build = state.build
    const pendingBuild = this.#pendingBuild
    if (!build || !pendingBuild
      || pendingBuild.generation !== this.#buildGeneration
      || build.requestId !== pendingBuild.requestId) {
      return
    }
    this.#pendingBuild = null
    this.build = build
    if (build.type === 'build-success')
      this.#buildCache.set(pendingBuild.cacheKey, build)
  }

  async #requestBuild(buffer: SvelteBuildBuffer) {
    const generation = ++this.#buildGeneration
    this.#pendingBuild = null
    this.#clearBuildTimer()
    if (this.#disposed || !buffer.enabled || buffer.renderer !== 'svelte') {
      this.build = null
      return
    }

    const sourceHash = buffer.sourceHash ?? await this.#sourceHash(buffer.renderer, buffer.source)
    if (this.#disposed || generation !== this.#buildGeneration)
      return
    const key = cacheKey(buffer.renderer, sourceHash)
    const cached = this.#buildCache.get(key)
    if (cached) {
      this.build = cached
      return
    }

    this.build = null
    const requestId = this.#worker.build(buffer.source)
    this.#pendingBuild = { cacheKey: key, generation, requestId }
  }

  #clearBuildTimer() {
    if (this.#buildTimer !== undefined)
      clearTimeout(this.#buildTimer)
    this.#buildTimer = undefined
  }

  #clearDiagnosticTimer() {
    if (this.#diagnosticTimer !== undefined)
      clearTimeout(this.#diagnosticTimer)
    this.#diagnosticTimer = undefined
  }
}
