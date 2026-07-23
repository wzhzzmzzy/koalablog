import {
  type PreviewArtifact,
  PreviewCommandError,
  PreviewCommandSupersededError,
  PreviewCommandTimeoutError,
  type PreviewMessageEventTarget,
  type PreviewMessageTarget,
  SveltePreviewRpc,
} from '@/components/editor/svelte/preview-protocol'
import { describe, expect, it, vi } from 'vitest'

class FakeMessageTarget implements PreviewMessageTarget {
  messages: Array<{ message: unknown, targetOrigin: string }> = []

  postMessage(message: unknown, targetOrigin: string) {
    this.messages.push({ message, targetOrigin })
  }
}

class FakeMessageEventTarget implements PreviewMessageEventTarget {
  #listener: ((event: MessageEvent<unknown>) => void) | null = null

  addEventListener(_type: 'message', listener: (event: MessageEvent<unknown>) => void) {
    this.#listener = listener
  }

  removeEventListener(_type: 'message', listener: (event: MessageEvent<unknown>) => void) {
    if (this.#listener === listener)
      this.#listener = null
  }

  emit(data: unknown, source: MessageEventSource | null, origin = 'null') {
    this.#listener?.({ data, origin, source } as MessageEvent<unknown>)
  }
}

const artifact: PreviewArtifact = {
  css: '.koala { color: rebeccapurple; }',
  javascript: '({ mount() {}, unmount() {} })',
}

function commandId(target: FakeMessageTarget) {
  const message = target.messages.at(-1)?.message as { commandId: number }
  return message.commandId
}

describe('svelte Preview RPC', () => {
  it('settles only a completion from its opaque iframe for the current command', async () => {
    const eventTarget = new FakeMessageEventTarget()
    const iframe = new FakeMessageTarget()
    const rpc = new SveltePreviewRpc({ eventTarget })
    rpc.setTarget(iframe)

    const result = rpc.render(artifact)
    const currentCommandId = commandId(iframe)
    expect(iframe.messages).toEqual([{
      message: { type: 'koala-preview-render', commandId: currentCommandId, artifact },
      targetOrigin: '*',
    }])

    eventTarget.emit({ type: 'koala-preview-complete', commandId: currentCommandId }, new FakeMessageTarget() as unknown as MessageEventSource)
    eventTarget.emit({ type: 'koala-preview-complete', commandId: currentCommandId }, iframe as unknown as MessageEventSource, 'https://koalablog.invalid')
    eventTarget.emit({ type: 'koala-preview-complete', commandId: currentCommandId + 1 }, iframe as unknown as MessageEventSource)
    eventTarget.emit({ type: 'koala-preview-complete', commandId: currentCommandId }, iframe as unknown as MessageEventSource)

    await expect(result).resolves.toBeUndefined()
    rpc.dispose()
  })

  it('rejects a replaced command and ignores its later error', async () => {
    const eventTarget = new FakeMessageEventTarget()
    const iframe = new FakeMessageTarget()
    const rpc = new SveltePreviewRpc({ eventTarget })
    rpc.setTarget(iframe)

    const obsolete = rpc.render(artifact).catch(error => error)
    const obsoleteCommandId = commandId(iframe)
    const current = rpc.render({ ...artifact, css: '.current {}' })
    const currentCommandId = commandId(iframe)

    await expect(obsolete).resolves.toBeInstanceOf(PreviewCommandSupersededError)
    eventTarget.emit({ type: 'koala-preview-error', commandId: obsoleteCommandId, message: 'old preview broke' }, iframe as unknown as MessageEventSource)
    eventTarget.emit({ type: 'koala-preview-complete', commandId: currentCommandId }, iframe as unknown as MessageEventSource)

    await expect(current).resolves.toBeUndefined()
    rpc.dispose()
  })

  it('turns a current iframe error into one command failure and forwards current runtime errors', async () => {
    const eventTarget = new FakeMessageEventTarget()
    const iframe = new FakeMessageTarget()
    const runtimeErrors: string[] = []
    const rpc = new SveltePreviewRpc({
      eventTarget,
      onRuntimeError: error => runtimeErrors.push(error.message),
    })
    rpc.setTarget(iframe)

    const result = rpc.render(artifact)
    const currentCommandId = commandId(iframe)
    eventTarget.emit({ type: 'koala-preview-error', commandId: currentCommandId, message: 'mount failed' }, iframe as unknown as MessageEventSource)
    await expect(result).rejects.toEqual(new PreviewCommandError(currentCommandId, 'mount failed'))

    const next = rpc.render(artifact)
    const nextCommandId = commandId(iframe)
    eventTarget.emit({ type: 'koala-preview-runtime-error', commandId: currentCommandId, message: 'obsolete runtime error' }, iframe as unknown as MessageEventSource)
    eventTarget.emit({ type: 'koala-preview-runtime-error', commandId: nextCommandId, message: 'current runtime error' }, iframe as unknown as MessageEventSource)
    eventTarget.emit({ type: 'koala-preview-complete', commandId: nextCommandId }, iframe as unknown as MessageEventSource)

    expect(runtimeErrors).toEqual(['current runtime error'])
    await expect(next).resolves.toBeUndefined()
    rpc.dispose()
  })

  it('times out exactly the current command and returns focus only for the current iframe command', async () => {
    vi.useFakeTimers()
    const eventTarget = new FakeMessageEventTarget()
    const iframe = new FakeMessageTarget()
    const focusReturns: number[] = []
    const rpc = new SveltePreviewRpc({ eventTarget, onFocusReturn: commandId => focusReturns.push(commandId), timeoutMs: 500 })
    rpc.setTarget(iframe)

    const result = rpc.render(artifact)
    const currentCommandId = commandId(iframe)
    eventTarget.emit({ type: 'koala-preview-focus-return', commandId: currentCommandId - 1 }, iframe as unknown as MessageEventSource)
    eventTarget.emit({ type: 'koala-preview-focus-return', commandId: currentCommandId }, iframe as unknown as MessageEventSource)
    vi.advanceTimersByTime(500)

    expect(focusReturns).toEqual([currentCommandId])
    await expect(result).rejects.toEqual(new PreviewCommandTimeoutError(currentCommandId, 500))
    rpc.dispose()
    vi.useRealTimers()
  })
})
