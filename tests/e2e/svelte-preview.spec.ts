import type { Page } from '@playwright/test'
import { expect, test } from './fixture'

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
    snapshot: (artifact: PreviewArtifact) => Promise<string>
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

test('opaque Svelte Preview captures DOM for shared Snapshot canonicalization', async ({ page }) => {
  await openEditor(page)
  await installPreviewFixture(page)
  try {
    const { rawSnapshot, canonicalSnapshot, canonicalSnapshotFixture } = await page.evaluate(async () => {
      const fixture = (window as typeof window & { __koalaPreviewRpcFixture: BrowserPreviewFixture }).__koalaPreviewRpcFixture
      const snapshotModulePath = '/src/lib/svelte/snapshot.ts'
      const snapshotFixtureModulePath = '/src/tests/svelte/snapshot-fixture.ts'
      const { canonicalizeSnapshotHtml } = await import(/* @vite-ignore */ snapshotModulePath)
      const { snapshotFixture, canonicalSnapshotFixture } = await import(/* @vite-ignore */ snapshotFixtureModulePath)
      const rawSnapshot = await fixture.rpc.snapshot({
        css: '',
        javascript: `({
          mount(target) {
            target.innerHTML = ${JSON.stringify(snapshotFixture)}
            return {}
          },
          unmount() {},
          flushSync() {},
          tick() { return Promise.resolve() }
        })`,
      })
      return { rawSnapshot, canonicalSnapshot: await canonicalizeSnapshotHtml(rawSnapshot), canonicalSnapshotFixture }
    })
    expect(rawSnapshot).toContain('onclick="alert(1)"')
    expect(rawSnapshot).toContain('<script>alert(1)</script>')
    expect(canonicalSnapshot).toBe(canonicalSnapshotFixture)
  }
  finally {
    await disposePreviewFixture(page)
  }
})

test('shared Snapshot canonicalizer preserves safe no-script navigation and forms', async ({ page }) => {
  await openEditor(page)
  const canonicalSnapshot = await page.evaluate(async () => {
    const snapshotModulePath = '/src/lib/svelte/snapshot.ts'
    const { canonicalizeSnapshotHtml } = await import(/* @vite-ignore */ snapshotModulePath)
    return canonicalizeSnapshotHtml('<a href="/posts/koala">Read</a><img src="https://images.example/koala.png"><form action="/search"><input name="q" value="koala"><button formaction="https://example.test/find">Find</button></form>')
  })

  expect(canonicalSnapshot).toBe('<a href="/posts/koala">Read</a><img src="https://images.example/koala.png"><form action="/search"><input name="q" value="koala"><button formaction="https://example.test/find">Find</button></form>')
  const preservedStructure = await page.evaluate((html) => {
    const root = document.createElement('div')
    root.innerHTML = html
    const link = root.querySelector('a')
    const image = root.querySelector('img')
    const form = root.querySelector('form')
    const input = root.querySelector('input')
    const button = root.querySelector('button')
    return {
      linkHref: link?.getAttribute('href'),
      imageSrc: image?.getAttribute('src'),
      formAction: form?.getAttribute('action'),
      inputIsNative: input instanceof HTMLInputElement,
      buttonIsNative: button instanceof HTMLButtonElement,
      buttonFormAction: button?.getAttribute('formaction'),
    }
  }, canonicalSnapshot)
  expect(preservedStructure).toEqual({
    linkHref: '/posts/koala',
    imageSrc: 'https://images.example/koala.png',
    formAction: '/search',
    inputIsNative: true,
    buttonIsNative: true,
    buttonFormAction: 'https://example.test/find',
  })
})

test('editor builds a Svelte buffer only after Preview opens', async ({ page }) => {
  await openEditor(page)
  await page.getByRole('radio', { name: 'Svelte' }).check()
  await expect(page.locator('[data-koala-svelte-preview]')).toHaveCount(0)

  const workerLoadReloadedEditor = page.waitForEvent('framenavigated', {
    predicate: frame => frame === page.mainFrame(),
  }).then(() => true)
  await page.getByRole('button', { name: 'Preview File' }).click()
  const reloadedEditor = await Promise.race([
    workerLoadReloadedEditor,
    page.waitForTimeout(5_000).then(() => false),
  ])

  if (reloadedEditor) {
    await page.waitForLoadState('networkidle')
    await page.getByRole('radio', { name: 'Svelte' }).check()
    await page.getByRole('button', { name: 'Preview File' }).click()
  }
  const preview = page.frameLocator('[data-koala-svelte-preview]')
  await expect(preview.locator('[data-koala-artifact-root]')).toContainText('First line', { timeout: 30_000 })
})
