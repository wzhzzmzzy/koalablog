import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

interface PreviewArtifact {
  css: string
  javascript: string
}

interface BrowserPreviewFixture {
  focusTarget: HTMLElement
  iframe: HTMLIFrameElement
  rpc: {
    dispose: () => void
    render: (artifact: PreviewArtifact) => Promise<void>
  }
  runtimeErrors: string[]
}

async function openEditor(page: Page) {
  await page.goto('/dashboard/edit?path=/phase-two')
  await page.waitForLoadState('networkidle')
}

async function installPreviewFixture(page: Page) {
  await page.evaluate(async () => {
    const protocolModulePath = '/src/components/editor/svelte/preview-protocol.ts'
    const srcdocModulePath = '/src/components/editor/svelte/preview-srcdoc.ts'
    const { SveltePreviewRpc } = await import(/* @vite-ignore */ protocolModulePath)
    const { createPreviewSrcdoc } = await import(/* @vite-ignore */ srcdocModulePath)
    const focusTarget = document.createElement('button')
    focusTarget.textContent = 'Return focus target'
    document.body.append(focusTarget)
    const iframe = document.createElement('iframe')
    iframe.setAttribute('sandbox', 'allow-scripts')
    iframe.srcdoc = createPreviewSrcdoc()
    document.body.append(iframe)
    await new Promise<void>((resolve, reject) => {
      iframe.addEventListener('load', () => resolve(), { once: true })
      iframe.addEventListener('error', () => reject(new Error('Preview iframe failed to load')), { once: true })
    })
    const runtimeErrors: string[] = []
    const rpc = new SveltePreviewRpc({
      onFocusReturn: () => focusTarget.focus(),
      onRuntimeError: error => runtimeErrors.push(error.message),
    })
    rpc.setTarget(iframe.contentWindow!)
    Object.assign(window, { __koalaPreviewRpcFixture: { focusTarget, iframe, rpc, runtimeErrors } })
  })
}

async function renderPreview(page: Page, artifact: PreviewArtifact) {
  await page.evaluate(async (nextArtifact) => {
    const fixture = (window as typeof window & { __koalaPreviewRpcFixture: BrowserPreviewFixture }).__koalaPreviewRpcFixture
    await fixture.rpc.render(nextArtifact)
  }, artifact)
}

async function renderPreviewError(page: Page, artifact: PreviewArtifact) {
  return page.evaluate(async (nextArtifact) => {
    const fixture = (window as typeof window & { __koalaPreviewRpcFixture: BrowserPreviewFixture }).__koalaPreviewRpcFixture
    try {
      await fixture.rpc.render(nextArtifact)
      return ''
    }
    catch (error) {
      return error instanceof Error ? error.message : String(error)
    }
  }, artifact)
}

async function replacePreviewDuringPendingUnmount(page: Page, obsolete: PreviewArtifact, current: PreviewArtifact) {
  return page.evaluate(async ({ obsolete, current }) => {
    const fixture = (window as typeof window & { __koalaPreviewRpcFixture: BrowserPreviewFixture }).__koalaPreviewRpcFixture
    const replaced = fixture.rpc.render(obsolete).catch(error => error instanceof Error ? error.message : String(error))
    await fixture.rpc.render(current)
    return replaced
  }, { obsolete, current })
}

async function disposePreviewFixture(page: Page) {
  return page.evaluate(() => {
    const fixture = (window as typeof window & { __koalaPreviewRpcFixture: BrowserPreviewFixture }).__koalaPreviewRpcFixture
    const result = {
      focusReturned: document.activeElement === fixture.focusTarget,
      runtimeErrors: fixture.runtimeErrors,
      sandbox: fixture.iframe.getAttribute('sandbox'),
    }
    fixture.rpc.dispose()
    fixture.iframe.remove()
    fixture.focusTarget.remove()
    return result
  })
}

const initialPreview: PreviewArtifact = {
  css: '.first { color: red; }',
  javascript: `({
    mount(target) {
      target.innerHTML = '<p id="first-preview">First preview</p>'
      return { target }
    },
    unmount(instance) {
      return new Promise(resolve => setTimeout(() => {
        instance.target.replaceChildren()
        resolve()
      }, 25))
    }
  })`,
}

const obsoletePreview: PreviewArtifact = {
  css: '.obsolete { color: orange; }',
  javascript: `({
    mount(target) {
      target.innerHTML = '<p id="obsolete-preview">Obsolete preview</p>'
      return {}
    },
    unmount() {}
  })`,
}

const currentPreview: PreviewArtifact = {
  css: '.second { color: blue; }',
  javascript: `({
    mount(target) {
      if (target.querySelector('#first-preview') || target.querySelector('#obsolete-preview'))
        throw new Error('previous preview was not cleared')
      if (document.querySelector('style[data-koala-artifact]').textContent !== '.second { color: blue; }')
        throw new Error('previous preview CSS was not replaced')
      target.innerHTML = '<p id="second-preview" class="second">Second preview</p>'
      return {}
    },
    unmount() {}
  })`,
}

test('opaque Svelte Preview remounts cleanly, returns focus, and forwards runtime failures', async ({ page }) => {
  await openEditor(page)
  await installPreviewFixture(page)
  try {
    await renderPreview(page, initialPreview)
    const supersededError = await replacePreviewDuringPendingUnmount(page, obsoletePreview, currentPreview)
    expect(supersededError).toContain('superseded')
    expect(await renderPreviewError(page, {
      css: '',
      javascript: '({ mount() { throw new Error("mount crash") }, unmount() {} })',
    })).toBe('mount crash')
    await renderPreview(page, {
      css: '',
      javascript: `({
        mount(target) {
          target.innerHTML = '<button type="button">Preview action</button>'
          setTimeout(() => {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
            throw new Error('late preview failure')
          }, 0)
          return {}
        },
        unmount() {}
      })`,
    })
    await expect.poll(() => page.evaluate(() => {
      const fixture = (window as typeof window & { __koalaPreviewRpcFixture: BrowserPreviewFixture }).__koalaPreviewRpcFixture
      return document.activeElement === fixture.focusTarget
    })).toBe(true)
    await expect.poll(() => page.evaluate(() => {
      const fixture = (window as typeof window & { __koalaPreviewRpcFixture: BrowserPreviewFixture }).__koalaPreviewRpcFixture
      return fixture.runtimeErrors
    })).toEqual(['late preview failure'])
  }
  finally {
    const result = await disposePreviewFixture(page)
    expect(result).toEqual({
      focusReturned: true,
      runtimeErrors: ['late preview failure'],
      sandbox: 'allow-scripts',
    })
  }
})

test('opaque Svelte Preview requests carry a null origin and no browser cookie', async ({ page }) => {
  let previewRequestHeaders: Record<string, string> | null = null
  await page.route('**/api/health?preview-rpc-probe=1', async (route) => {
    previewRequestHeaders = route.request().headers()
    await route.abort()
  })
  await openEditor(page)
  await installPreviewFixture(page)
  try {
    await renderPreview(page, {
      css: '',
      javascript: `({
        mount() {
          void fetch('/api/health?preview-rpc-probe=1').catch(() => {})
          return {}
        },
        unmount() {}
      })`,
    })
    await expect.poll(() => previewRequestHeaders).not.toBeNull()
  }
  finally {
    await disposePreviewFixture(page)
  }
  expect(previewRequestHeaders?.origin).toBe('null')
  expect(previewRequestHeaders?.cookie).toBeUndefined()
})
