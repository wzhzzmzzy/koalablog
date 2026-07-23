export interface PreviewArtifact {
  javascript: string
  css: string
}

export interface PreviewRenderCommand {
  type: 'koala-preview-render'
  commandId: number
  artifact: PreviewArtifact
}

export interface PreviewCompleteMessage {
  type: 'koala-preview-complete'
  commandId: number
}

export interface PreviewErrorMessage {
  type: 'koala-preview-error'
  commandId: number
  message: string
}

export interface PreviewRuntimeErrorMessage {
  type: 'koala-preview-runtime-error'
  commandId: number
  message: string
}

export interface PreviewFocusReturnMessage {
  type: 'koala-preview-focus-return'
  commandId: number
}

export type PreviewParentMessage = PreviewCompleteMessage | PreviewErrorMessage | PreviewRuntimeErrorMessage | PreviewFocusReturnMessage

export interface PreviewMessageTarget {
  postMessage: (message: unknown, targetOrigin: string) => void
}

export interface PreviewMessageEventTarget {
  addEventListener: (type: 'message', listener: (event: MessageEvent<unknown>) => void) => void
  removeEventListener: (type: 'message', listener: (event: MessageEvent<unknown>) => void) => void
}

export interface SveltePreviewRpcOptions {
  eventTarget?: PreviewMessageEventTarget
  onFocusReturn?: (commandId: number) => void
  onRuntimeError?: (error: PreviewRuntimeErrorMessage) => void
  timeoutMs?: number
}

interface PendingCommand {
  commandId: number
  reject: (error: Error) => void
  resolve: () => void
  timeout: ReturnType<typeof setTimeout>
}

const opaqueIframeOrigin = 'null'

function currentWindow(): PreviewMessageEventTarget {
  if (typeof window === 'undefined')
    throw new Error('Svelte Preview RPC requires a browser message event target')
  return window
}

function isCommandId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

export function isPreviewParentMessage(value: unknown): value is PreviewParentMessage {
  if (!value || typeof value !== 'object')
    return false
  const message = value as { type?: unknown, commandId?: unknown, message?: unknown }
  if (!isCommandId(message.commandId))
    return false
  if (message.type === 'koala-preview-complete' || message.type === 'koala-preview-focus-return')
    return true
  return (message.type === 'koala-preview-error' || message.type === 'koala-preview-runtime-error')
    && isString(message.message)
}

export class PreviewCommandError extends Error {
  constructor(readonly commandId: number, message: string) {
    super(message)
    this.name = 'PreviewCommandError'
  }
}

export class PreviewCommandSupersededError extends PreviewCommandError {
  constructor(commandId: number) {
    super(commandId, 'Preview command was superseded by a newer render')
    this.name = 'PreviewCommandSupersededError'
  }
}

export class PreviewCommandTimeoutError extends PreviewCommandError {
  constructor(commandId: number, timeoutMs: number) {
    super(commandId, `Preview command timed out after ${timeoutMs}ms`)
    this.name = 'PreviewCommandTimeoutError'
  }
}

export class SveltePreviewRpc {
  #eventTarget: PreviewMessageEventTarget
  #onFocusReturn: (commandId: number) => void
  #onRuntimeError: (error: PreviewRuntimeErrorMessage) => void
  #target: PreviewMessageTarget | null = null
  #timeoutMs: number
  #nextCommandId = 0
  #latestCommandId = 0
  #pending: PendingCommand | null = null
  #disposed = false

  constructor(options: SveltePreviewRpcOptions = {}) {
    this.#eventTarget = options.eventTarget ?? currentWindow()
    this.#timeoutMs = options.timeoutMs ?? 5_000
    this.#onFocusReturn = options.onFocusReturn ?? (() => {})
    this.#onRuntimeError = options.onRuntimeError ?? (() => {})
    this.#eventTarget.addEventListener('message', this.#onMessage)
  }

  setTarget(target: PreviewMessageTarget | null) {
    this.#target = target
  }

  render(artifact: PreviewArtifact): Promise<void> {
    if (this.#disposed)
      return Promise.reject(new Error('Svelte Preview RPC has been disposed'))
    if (!this.#target)
      return Promise.reject(new Error('Svelte Preview iframe is not ready'))

    if (this.#pending)
      this.#settlePending(new PreviewCommandSupersededError(this.#pending.commandId))
    const commandId = ++this.#nextCommandId
    this.#latestCommandId = commandId

    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (this.#pending?.commandId === commandId)
          this.#settlePending(new PreviewCommandTimeoutError(commandId, this.#timeoutMs))
      }, this.#timeoutMs)
      this.#pending = { commandId, reject, resolve, timeout }
      this.#target?.postMessage({ type: 'koala-preview-render', commandId, artifact } satisfies PreviewRenderCommand, '*')
    })
  }

  dispose() {
    if (this.#disposed)
      return
    this.#disposed = true
    this.#eventTarget.removeEventListener('message', this.#onMessage)
    if (this.#pending)
      this.#settlePending(new PreviewCommandSupersededError(this.#pending.commandId))
    this.#target = null
  }

  #onMessage = (event: MessageEvent<unknown>) => {
    if (event.origin !== opaqueIframeOrigin || event.source !== this.#target || !isPreviewParentMessage(event.data))
      return
    const message = event.data
    if (message.commandId !== this.#latestCommandId)
      return
    if (message.type === 'koala-preview-focus-return') {
      this.#onFocusReturn(message.commandId)
      return
    }
    if (message.type === 'koala-preview-runtime-error') {
      this.#onRuntimeError(message)
      return
    }
    if (message.type === 'koala-preview-complete') {
      this.#settlePending(null)
      return
    }
    this.#settlePending(new PreviewCommandError(message.commandId, message.message))
  }

  #settlePending(error: Error | null) {
    const pending = this.#pending
    if (!pending)
      return
    this.#pending = null
    clearTimeout(pending.timeout)
    if (error)
      pending.reject(error)
    else
      pending.resolve()
  }
}
