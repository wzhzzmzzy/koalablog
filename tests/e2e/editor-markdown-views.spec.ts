import { expect, test } from './fixture'

async function openEditor(page: import('@playwright/test').Page) {
  await page.goto('/dashboard/edit?path=/phase-two')
  await page.waitForLoadState('networkidle')
}

test('Markdown Source, Preview, and Split share one live CodeMirror Edit Buffer', async ({ page }) => {
  await openEditor(page)

  const source = page.getByRole('textbox', { name: 'File Source for /phase-two' })
  const toolbar = page.getByTestId('editor-toolbar')
  await expect(toolbar.getByRole('button', { name: 'source' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.cm-editor')).toHaveCount(1)

  await source.fill('Dirty preview text')
  await toolbar.getByRole('button', { name: 'preview' }).click()
  const preview = page.getByRole('article', { name: 'Markdown Preview' })
  await expect(preview).toContainText('Dirty preview text')
  await expect(preview).toBeFocused()
  await expect(page.locator('.cm-editor')).toHaveCount(1)

  await toolbar.getByRole('button', { name: 'source' }).click()
  await expect(source).toBeFocused()
  await toolbar.getByRole('button', { name: 'split' }).click()
  const separator = page.getByRole('separator', { name: 'Resize Source and Preview panes' })
  await expect(separator).toBeVisible()
  await expect(preview).toContainText('Dirty preview text')
  await expect(page.locator('.cm-editor')).toHaveCount(1)

  const startingValue = Number(await separator.getAttribute('aria-valuenow'))
  await separator.press('ArrowRight')
  await expect.poll(async () => Number(await separator.getAttribute('aria-valuenow'))).toBeGreaterThan(startingValue)
  const box = await separator.boundingBox()
  if (!box)
    throw new Error('Expected a Split separator')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + 70, box.y + box.height / 2)
  await page.mouse.up()
  await expect.poll(async () => Number(await separator.getAttribute('aria-valuenow'))).not.toBe(startingValue)
})

test('Split falls back for the content container without losing the requested preference', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 700 })
  await openEditor(page)

  const toolbar = page.getByTestId('editor-toolbar')
  await toolbar.getByRole('button', { name: 'split' }).click()
  await expect(toolbar.getByRole('button', { name: 'split' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('separator', { name: 'Resize Source and Preview panes' })).toHaveCount(0)

  await page.getByRole('button', { name: 'Toggle sidebar' }).click()
  await expect(page.getByRole('separator', { name: 'Resize Source and Preview panes' })).toBeVisible()

  await page.getByRole('button', { name: 'Toggle sidebar' }).click()
  await expect(page.getByRole('separator', { name: 'Resize Source and Preview panes' })).toHaveCount(0)
  await expect(toolbar.getByRole('button', { name: 'split' })).toHaveAttribute('aria-pressed', 'true')
})

test('Split keeps both panes at least 320px wide after the container shrinks', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 700 })
  await openEditor(page)

  const toolbar = page.getByTestId('editor-toolbar')
  await toolbar.getByRole('button', { name: 'split' }).click()
  const separator = page.getByRole('separator', { name: 'Resize Source and Preview panes' })
  await expect(separator).toBeVisible()
  await separator.press('Home')

  await page.setViewportSize({ width: 1100, height: 700 })
  const sourcePane = page.locator('.editor-view-layout--split .editor-canvas')
  const previewPane = page.locator('.editor-view-layout--split .editor-markdown-preview')
  await expect(separator).toBeVisible()
  await expect.poll(async () => (await sourcePane.boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(320)
  await expect.poll(async () => (await previewPane.boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(320)
})
