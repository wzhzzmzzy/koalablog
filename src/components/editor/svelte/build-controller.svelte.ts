import type { RendererMode } from '@/lib/files/types'
import type { SvelteWorkerClientListener, SvelteWorkerClientState } from './worker-client'
import { mapSvelteDiagnostics, type TextEditorDiagnosticUpdate } from '../text-editor/diagnostics'
import { SvelteWorkerClient } from './worker-client'

export interface SvelteDiagnosticBuffer {
  fileId: number
  renderer: RendererMode
  source: string
  enabled: boolean
}

export interface SvelteDiagnosticWorker {
  diagnose: (source: string) => number
  subscribe: (listener: SvelteWorkerClientListener) => () => void
  dispose: () => void
}

export interface SvelteBuildControllerOptions {
  debounceMs?: number
  worker?: SvelteDiagnosticWorker
}

interface PendingDiagnostic {
  generation: number
  requestId: number
}

export class SvelteBuildController {
  diagnostics = $state<TextEditorDiagnosticUpdate | null>(null)

  #debounceMs: number
  #worker: SvelteDiagnosticWorker
  #unsubscribe: () => void
  #timer: ReturnType<typeof setTimeout> | undefined
  #generation = 0
  #pending: PendingDiagnostic | null = null
  #disposed = false

  constructor(options: SvelteBuildControllerOptions = {}) {
    this.#debounceMs = options.debounceMs ?? 350
    this.#worker = options.worker ?? new SvelteWorkerClient()
    this.#unsubscribe = this.#worker.subscribe(this.#onWorkerState)
  }

  diagnose(buffer: SvelteDiagnosticBuffer) {
    if (this.#disposed)
      return
    this.#generation += 1
    const generation = this.#generation
    this.#pending = null
    this.diagnostics = null
    this.#clearTimer()

    if (!buffer.enabled || buffer.renderer !== 'svelte')
      return

    const source = buffer.source
    this.#timer = setTimeout(() => {
      if (this.#disposed || generation !== this.#generation)
        return
      const requestId = this.#worker.diagnose(source)
      this.#pending = { generation, requestId }
    }, this.#debounceMs)
  }

  dispose() {
    if (this.#disposed)
      return
    this.#disposed = true
    this.#generation += 1
    this.#pending = null
    this.#clearTimer()
    this.#unsubscribe()
    this.#worker.dispose()
  }

  #onWorkerState = (state: SvelteWorkerClientState) => {
    const result = state.diagnostics
    const pending = this.#pending
    if (!result || !pending
      || pending.generation !== this.#generation
      || result.requestId !== pending.requestId) {
      return
    }
    this.diagnostics = mapSvelteDiagnostics(result.requestId, result.diagnostics)
  }

  #clearTimer() {
    if (this.#timer !== undefined)
      clearTimeout(this.#timer)
    this.#timer = undefined
  }
}
