import type { Page } from '@playwright/test'
import { expect, test } from './fixture'

interface PreviewArtifact {
  css: string
  javascript: string
}

interface BrowserPreviewFixture {
  focusTarget: HTMLElement
  host: HTMLElement
  runtime: {
    dispose: () => Promise<void>
    render: (artifact: PreviewArtifact) => Promise<void>
  }
  runtimeErrors: string[]
}

async function openEditor(page: Page) {
  await page.goto('/dashboard/edit?path=/phase-two')
  await page.waitForLoadState('networkidle')
}

async function chooseSvelteRenderer(page: Page) {
  await page.getByRole('button', { name: 'More File actions' }).click()
  await page.getByRole('menuitemradio', { name: 'Svelte' }).click()
}

async function installPreviewFixture(page: Page) {
  await page.evaluate(async () => {
    const runtimeModulePath = '/src/components/editor/svelte/preview-runtime.ts'
    const { InDocumentPreviewRuntime } = await import(/* @vite-ignore */ runtimeModulePath)
    const body = document.body as unknown as HTMLBodyElement
    const focusTarget = document.createElement('button')
    focusTarget.textContent = 'Return focus target'
    body.appendChild(focusTarget)
    const host = document.createElement('div')
    const style = document.createElement('style')
    style.dataset.koalaArtifact = ''
    const root = document.createElement('div')
    root.dataset.koalaArtifactRoot = ''
    root.tabIndex = -1
    host.appendChild(style)
    host.appendChild(root)
    body.appendChild(host)
    const runtimeErrors: string[] = []
    const runtime = new InDocumentPreviewRuntime({
      root,
      style,
      onFocusReturn: () => focusTarget.focus(),
      onRuntimeError: (error: { message: string }) => runtimeErrors.push(error.message),
    })
    Object.assign(window, { __koalaPreviewRpcFixture: { focusTarget, host, runtime, runtimeErrors } })
  })
}

async function renderPreview(page: Page, artifact: PreviewArtifact) {
  await page.evaluate(async (nextArtifact) => {
    const fixture = (window as typeof window & { __koalaPreviewRpcFixture: BrowserPreviewFixture }).__koalaPreviewRpcFixture
    await fixture.runtime.render(nextArtifact)
  }, artifact)
}

async function renderPreviewError(page: Page, artifact: PreviewArtifact) {
  return page.evaluate(async (nextArtifact) => {
    const fixture = (window as typeof window & { __koalaPreviewRpcFixture: BrowserPreviewFixture }).__koalaPreviewRpcFixture
    try {
      await fixture.runtime.render(nextArtifact)
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
    const replaced = fixture.runtime.render(obsolete).catch(error => error instanceof Error ? error.message : String(error))
    await fixture.runtime.render(current)
    return replaced
  }, { obsolete, current })
}

async function disposePreviewFixture(page: Page) {
  return page.evaluate(async () => {
    const fixture = (window as typeof window & { __koalaPreviewRpcFixture: BrowserPreviewFixture }).__koalaPreviewRpcFixture
    const result = {
      focusReturned: document.activeElement === fixture.focusTarget,
      runtimeErrors: fixture.runtimeErrors,
    }
    await fixture.runtime.dispose()
    fixture.host.remove()
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

test('in-document Svelte Preview remounts cleanly, returns focus, and forwards runtime failures', async ({ page }) => {
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
            target.querySelector('button').dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }))
            window.dispatchEvent(new ErrorEvent('error', { error: new Error('late preview failure') }))
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
    })
  }
})

test('editor builds a visible Svelte Preview only after Preview opens', async ({ page }) => {
  await openEditor(page)
  await chooseSvelteRenderer(page)
  await expect(page.locator('[data-koala-svelte-preview]:visible')).toHaveCount(0)

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
    await chooseSvelteRenderer(page)
    await page.getByRole('button', { name: 'Preview File' }).click()
  }
  const preview = page.locator('.editor-preview-overlay [data-koala-svelte-preview]')
  await expect(preview).toHaveCount(1)
  await expect(preview.locator('[data-koala-artifact-root]')).toContainText('First line', { timeout: 30_000 })
  await expect(page.locator('iframe[data-koala-svelte-preview]')).toHaveCount(0)
})

test('editor Preview gives Svelte output the active dark-theme text color', async ({ page }) => {
  await openEditor(page)
  await page.locator('html').evaluate((element) => {
    element.setAttribute('data-theme', 'dark')
  })
  await chooseSvelteRenderer(page)

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
    await page.locator('html').evaluate((element) => {
      element.setAttribute('data-theme', 'dark')
    })
    await chooseSvelteRenderer(page)
    await page.getByRole('button', { name: 'Preview File' }).click()
  }

  const expectedTextColor = await page.locator('body').evaluate(element => getComputedStyle(element).color)

  const artifactRoot = page.locator('[data-koala-svelte-preview] [data-koala-artifact-root]')
  await expect(artifactRoot).toContainText('First line', { timeout: 30_000 })
  await expect(artifactRoot).toHaveCSS('color', expectedTextColor)
})
