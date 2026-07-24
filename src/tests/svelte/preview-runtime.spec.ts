import {
  InDocumentPreviewRuntime,
  type PreviewArtifact,
  PreviewCommandSupersededError,
  type PreviewRuntimeEventTarget,
} from '@/components/editor/svelte/preview-runtime'
import { describe, expect, it, vi } from 'vitest'

class FakeEventTarget implements PreviewRuntimeEventTarget {
  #listeners = new Map<string, EventListener>()

  addEventListener(type: string, listener: EventListener) {
    this.#listeners.set(type, listener)
  }

  removeEventListener(type: string, listener: EventListener) {
    if (this.#listeners.get(type) === listener)
      this.#listeners.delete(type)
  }

  emit(type: string, event: Event) {
    this.#listeners.get(type)?.(event)
  }
}

function fixture() {
  const root = {
    contains: vi.fn(() => true),
    focus: vi.fn(),
    innerHTML: '',
    replaceChildren: vi.fn(function (this: { innerHTML: string }) {
      this.innerHTML = ''
    }),
  }
  const style = { textContent: '' }
  const eventTarget = new FakeEventTarget()
  const unmount = vi.fn((instance: { target: typeof root }) => instance.target.replaceChildren())
  const evaluate = vi.fn((javascript: string) => ({
    mount(target: typeof root) {
      target.innerHTML = javascript
      return { target }
    },
    unmount,
    flushSync: vi.fn(),
    tick: () => Promise.resolve(),
  }))
  const runtime = new InDocumentPreviewRuntime({
    evaluate,
    eventTarget,
    root: root as unknown as HTMLElement,
    style: style as unknown as HTMLStyleElement,
    waitForPaint: async () => {},
  })
  return { evaluate, eventTarget, root, runtime, style, unmount }
}

function artifact(javascript: string, css = '.koala { color: rebeccapurple; }'): PreviewArtifact {
  return { css, javascript }
}

describe('in-document Svelte Preview runtime', () => {
  it('replaces the active Component and captures its settled DOM Snapshot', async () => {
    const { root, runtime, style, unmount } = fixture()

    await runtime.render(artifact('<p>First preview</p>', '.first { color: red; }'))
    const snapshot = await runtime.snapshot(artifact('<p>Second preview</p>', '.second { color: blue; }'))

    expect(unmount).toHaveBeenCalledTimes(1)
    expect(style.textContent).toBe('.second { color: blue; }')
    expect(root.innerHTML).toBe('<p>Second preview</p>')
    expect(snapshot).toBe('<p>Second preview</p>')
    await runtime.dispose()
  })

  it('supersedes queued work before it can mount over the current Preview', async () => {
    const { root, runtime } = fixture()
    await runtime.render(artifact('<p>Initial</p>'))

    const obsolete = runtime.render(artifact('<p>Obsolete</p>')).catch(error => error)
    const current = runtime.render(artifact('<p>Current</p>', '.current {}'))

    await expect(obsolete).resolves.toBeInstanceOf(PreviewCommandSupersededError)
    await expect(current).resolves.toBeUndefined()
    expect(root.innerHTML).toBe('<p>Current</p>')
    await runtime.dispose()
  })

  it('forwards active runtime errors and returns focus for Escape inside the Artifact root', async () => {
    const { eventTarget, root, runtime } = fixture()
    const errors: string[] = []
    const focusReturns = vi.fn()
    await runtime.dispose()

    const observedRuntime = new InDocumentPreviewRuntime({
      evaluate: () => ({ mount: () => ({}), unmount: () => {} }),
      eventTarget,
      onFocusReturn: focusReturns,
      onRuntimeError: error => errors.push(error.message),
      root: root as unknown as HTMLElement,
      style: { textContent: '' } as HTMLStyleElement,
      waitForPaint: async () => {},
    })
    await observedRuntime.render(artifact('ignored'))

    eventTarget.emit('error', { error: new Error('late preview failure') } as unknown as Event)
    const escape = { key: 'Escape', preventDefault: vi.fn(), target: root } as unknown as Event
    eventTarget.emit('keydown', escape)

    expect(errors).toEqual(['late preview failure'])
    expect(focusReturns).toHaveBeenCalledTimes(1)
    expect((escape as unknown as { preventDefault: ReturnType<typeof vi.fn> }).preventDefault).toHaveBeenCalledTimes(1)
    await observedRuntime.dispose()
  })

  it('unmounts the active Component and removes its generated CSS on dispose', async () => {
    const { root, runtime, style, unmount } = fixture()
    await runtime.render(artifact('<p>Koala</p>'))

    await runtime.dispose()

    expect(unmount).toHaveBeenCalledTimes(1)
    expect(root.innerHTML).toBe('')
    expect(style.textContent).toBe('')
  })
})
