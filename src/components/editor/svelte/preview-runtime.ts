export interface PreviewArtifact {
  javascript: string
  css: string
}

export interface PreviewRuntimeErrorMessage {
  message: string
}

export class PreviewCommandSupersededError extends Error {
  constructor() {
    super('Preview command was superseded by a newer render')
    this.name = 'PreviewCommandSupersededError'
  }
}

interface PreviewArtifactApi {
  mount: (target: HTMLElement) => unknown
  unmount: (instance: unknown) => void | Promise<void>
  flushSync?: () => void
  tick?: () => Promise<void>
}

interface ActivePreview {
  api: PreviewArtifactApi
  instance: unknown
}

interface PendingCommand {
  commandId: number
  reject: (error: Error) => void
  resolve: (html?: string) => void
}

interface PreviewCommand {
  artifact: PreviewArtifact
  commandId: number
  type: 'render' | 'snapshot'
}

export interface PreviewRuntimeEventTarget {
  addEventListener: (type: string, listener: EventListener) => void
  removeEventListener: (type: string, listener: EventListener) => void
}

export interface InDocumentPreviewRuntimeOptions {
  root: HTMLElement
  style: HTMLStyleElement
  evaluate?: (javascript: string) => unknown
  eventTarget?: PreviewRuntimeEventTarget
  onFocusReturn?: () => void
  onRuntimeError?: (error: PreviewRuntimeErrorMessage) => void
  waitForPaint?: () => Promise<void>
}

function browserEventTarget(): PreviewRuntimeEventTarget {
  if (typeof window === 'undefined')
    throw new Error('Svelte Preview requires a browser event target')
  return window
}

function defaultEvaluate(javascript: string) {
  // Artifacts are trusted site-owned application code and the browser compiler
  // emits a self-contained IIFE expression for this exact execution seam.
  // eslint-disable-next-line no-eval
  return (0, eval)(javascript)
}

function defaultWaitForPaint() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function isPreviewArtifactApi(value: unknown): value is PreviewArtifactApi {
  if (!value || typeof value !== 'object')
    return false
  const api = value as Partial<PreviewArtifactApi>
  return typeof api.mount === 'function' && typeof api.unmount === 'function'
}

export class InDocumentPreviewRuntime {
  #active: ActivePreview | null = null
  #disposed = false
  #evaluate: (javascript: string) => unknown
  #eventTarget: PreviewRuntimeEventTarget
  #latestCommandId = 0
  #onFocusReturn: () => void
  #onRuntimeError: (error: PreviewRuntimeErrorMessage) => void
  #pending: PendingCommand | null = null
  #queue = Promise.resolve()
  #root: HTMLElement
  #style: HTMLStyleElement
  #waitForPaint: () => Promise<void>

  constructor(options: InDocumentPreviewRuntimeOptions) {
    this.#root = options.root
    this.#style = options.style
    this.#evaluate = options.evaluate ?? defaultEvaluate
    this.#eventTarget = options.eventTarget ?? browserEventTarget()
    this.#onFocusReturn = options.onFocusReturn ?? (() => {})
    this.#onRuntimeError = options.onRuntimeError ?? (() => {})
    this.#waitForPaint = options.waitForPaint ?? defaultWaitForPaint
    this.#eventTarget.addEventListener('error', this.#onError)
    this.#eventTarget.addEventListener('unhandledrejection', this.#onUnhandledRejection)
    this.#eventTarget.addEventListener('keydown', this.#onKeyDown)
  }

  async render(artifact: PreviewArtifact) {
    await this.#request('render', artifact)
  }

  async snapshot(artifact: PreviewArtifact) {
    return (await this.#request('snapshot', artifact)) ?? ''
  }

  focus() {
    this.#root.focus({ preventScroll: true })
  }

  async dispose() {
    if (this.#disposed)
      return
    this.#disposed = true
    this.#eventTarget.removeEventListener('error', this.#onError)
    this.#eventTarget.removeEventListener('unhandledrejection', this.#onUnhandledRejection)
    this.#eventTarget.removeEventListener('keydown', this.#onKeyDown)
    if (this.#pending)
      this.#settle(this.#pending.commandId, new PreviewCommandSupersededError())
    try {
      await this.#clearActive()
    }
    finally {
      this.#style.textContent = ''
      this.#root.replaceChildren()
    }
  }

  #request(type: PreviewCommand['type'], artifact: PreviewArtifact) {
    if (this.#disposed)
      return Promise.reject(new Error('Svelte Preview has been disposed'))
    if (this.#pending)
      this.#settle(this.#pending.commandId, new PreviewCommandSupersededError())

    const commandId = ++this.#latestCommandId
    return new Promise<string | undefined>((resolve, reject) => {
      this.#pending = { commandId, reject, resolve }
      const command = { artifact, commandId, type }
      this.#queue = this.#queue.then(() => this.#run(command))
    })
  }

  async #run(command: PreviewCommand) {
    try {
      await this.#clearActive()
      if (!this.#isCurrent(command.commandId))
        return

      this.#style.textContent = command.artifact.css
      const api = this.#evaluate(command.artifact.javascript)
      if (!isPreviewArtifactApi(api))
        throw new Error('Preview Artifact must export mount and unmount functions')
      const instance = await api.mount(this.#root)
      if (!this.#isCurrent(command.commandId)) {
        await api.unmount(instance)
        return
      }
      this.#active = { api, instance }

      if (command.type === 'snapshot') {
        api.flushSync?.()
        if (api.tick)
          await api.tick()
        await this.#waitForPaint()
        if (!this.#isCurrent(command.commandId))
          return
        this.#settle(command.commandId, null, this.#root.innerHTML)
        return
      }

      this.#settle(command.commandId)
    }
    catch (error) {
      if (!this.#isCurrent(command.commandId))
        return
      this.#active = null
      this.#root.replaceChildren()
      this.#settle(command.commandId, error instanceof Error ? error : new Error(errorMessage(error)))
    }
  }

  async #clearActive() {
    const active = this.#active
    this.#active = null
    if (active)
      await active.api.unmount(active.instance)
    this.#root.replaceChildren()
  }

  #isCurrent(commandId: number) {
    return !this.#disposed && this.#latestCommandId === commandId && this.#pending?.commandId === commandId
  }

  #settle(commandId: number, error: Error | null = null, html?: string) {
    const pending = this.#pending
    if (!pending || pending.commandId !== commandId)
      return
    this.#pending = null
    if (error)
      pending.reject(error)
    else
      pending.resolve(html)
  }

  #reportRuntimeError(error: unknown) {
    if (this.#disposed || !this.#active)
      return
    this.#onRuntimeError({ message: errorMessage(error) })
  }

  #onError = (event: Event) => {
    const detail = event as Event & { error?: unknown, message?: unknown }
    this.#reportRuntimeError(detail.error ?? detail.message ?? 'Preview runtime error')
  }

  #onUnhandledRejection = (event: Event) => {
    const detail = event as Event & { reason?: unknown }
    this.#reportRuntimeError(detail.reason ?? 'Preview runtime rejection')
  }

  #onKeyDown = (event: Event) => {
    const keyboardEvent = event as KeyboardEvent
    if (keyboardEvent.key !== 'Escape' || !this.#active || !this.#root.contains(keyboardEvent.target as Node))
      return
    keyboardEvent.preventDefault()
    this.#onFocusReturn()
  }
}
