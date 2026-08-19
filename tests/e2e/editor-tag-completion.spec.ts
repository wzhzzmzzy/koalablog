import type { Locator } from '@playwright/test'
import { expect, test } from './fixture'

async function editorText(source: Locator) {
  // CodeMirror renders logical lines as block children, so textContent loses
  // the line boundaries that users see and that Save reconciliation preserves.
  // eslint-disable-next-line unicorn/prefer-dom-node-text-content
  return source.evaluate(element => (element as HTMLElement).innerText)
}

async function editorSelectionOffset(source: Locator) {
  return source.evaluate((element) => {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0)
      return null

    const range = selection.getRangeAt(0).cloneRange()
    range.selectNodeContents(element)
    range.setEnd(selection.anchorNode!, selection.anchorOffset)
    return range.toString().length
  })
}

function normalizedEditorText(value: string) {
  return value.replace(/\n{3,}/g, '\n\n')
}

async function openEditor(page: import('@playwright/test').Page) {
  await page.goto('/dashboard/edit?path=/phase-two')
  await page.waitForLoadState('networkidle')
  return page.getByRole('textbox', { name: 'File Source for /phase-two' })
}

test('Save reconciles body tags into visible frontmatter and remains clean after reload', async ({ page }) => {
  const source = await openEditor(page)
  await source.fill('Body #new-tag')
  await page.getByRole('button', { name: 'Save File' }).click()

  await expect(page.getByText('Source saved.')).toBeVisible()
  await expect.poll(async () => normalizedEditorText(await editorText(source)))
    .toBe('---\ntags: ["new-tag"]\n---\n\nBody #new-tag')
  await expect(page.getByText('Unsaved changes')).toBeHidden()

  await page.reload()
  await page.waitForLoadState('networkidle')
  await expect.poll(async () => normalizedEditorText(await editorText(page.getByRole('textbox', { name: 'File Source for /phase-two' }))))
    .toBe('---\ntags: ["new-tag"]\n---\n\nBody #new-tag')
})

test('typing while Save is in flight keeps the newer Edit Buffer on the saved revision', async ({ page }) => {
  const source = await openEditor(page)
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/_actions/form.save/**', async (route) => {
    await gate
    await route.continue()
  })

  await source.fill('Body #saved-tag')
  await page.getByRole('button', { name: 'Save File' }).click()
  await expect.poll(async () => normalizedEditorText(await editorText(source)))
    .toContain('tags: ["saved-tag"]')
  await source.pressSequentially('\nnewer typing')
  const expectedSource = '---\ntags: ["saved-tag"]\n---\n\nBody #saved-tag\nnewer typing'
  await expect.poll(async () => normalizedEditorText(await editorText(source))).toBe(expectedSource)
  const selectionBeforeResponse = await editorSelectionOffset(source)
  release()

  await expect(page.getByText('Source saved.')).toBeVisible()
  await expect.poll(async () => normalizedEditorText(await editorText(source))).toBe(expectedSource)
  await expect(source).toBeFocused()
  await expect.poll(async () => editorSelectionOffset(source)).toBe(selectionBeforeResponse)
  await expect(page.getByText('Unsaved changes')).toBeVisible()

  await expect(page.getByRole('button', { name: 'Save File' })).toBeEnabled()
  await page.getByRole('button', { name: 'Save File' }).click()
  await expect(page.getByText('Unsaved changes')).toBeHidden()
})

test('Tag and File Reference completion share one keyboard-accessible picker', async ({ page }) => {
  const source = await openEditor(page)
  const tooltip = page.locator('.cm-tooltip-autocomplete')

  await source.fill('Tag ')
  await source.pressSequentially('#')
  await expect(tooltip).toBeVisible()
  await expect(tooltip).toContainText('javascript')
  await expect(tooltip).toContainText('2 Files')
  await expect(tooltip).toContainText('测试标签')
  await source.pressSequentially('java')
  await expect(tooltip).toBeVisible()
  await expect(tooltip).not.toHaveClass(/cm-tooltip-autocomplete-disabled/)
  await expect(tooltip.locator('li[aria-selected="true"]')).toContainText('javascript')
  await source.press('Tab')
  await expect.poll(async () => (await editorText(source)).trimStart()).toBe('Tag #javascript')

  await source.pressSequentially('\nSee [[')
  await expect(tooltip).toBeVisible()
  await expect(tooltip).toContainText('second')
  await source.pressSequentially('second')
  await expect(tooltip).toBeVisible()
  await expect(tooltip).not.toHaveClass(/cm-tooltip-autocomplete-disabled/)
  await expect(tooltip.locator('li[aria-selected="true"]')).toContainText('/second')
  await source.press('Enter')
  await expect.poll(async () => normalizedEditorText(await editorText(source))).toContain('See [[/second]]')
})

test('Tag completion excludes frontmatter, headings, escaped syntax, code, and links', async ({ page }) => {
  const source = await openEditor(page)
  const tooltip = page.locator('.cm-tooltip-autocomplete')

  for (const text of [
    '---\ntags: #java\n---\nBody',
    '# ',
    '\\#java',
    '`#java`',
    '[#java](/path)',
  ]) {
    await source.fill(text)
    await source.press('End')
    await expect(tooltip).toBeHidden()
  }
})

test('completion popup and active option stay fully inside desktop and mobile viewports', async ({ page }) => {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 393, height: 727 },
    { width: 320, height: 640 },
  ]) {
    await page.setViewportSize(viewport)
    const source = await openEditor(page)
    await source.fill(`Tag ${viewport.width} `)
    await source.pressSequentially('#')
    const tooltip = page.locator('.cm-tooltip-autocomplete')
    await expect(tooltip).toBeInViewport({ ratio: 1 })
    await expect(tooltip.locator('li[aria-selected="true"]')).toBeInViewport({ ratio: 1 })
    const box = await tooltip.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.y).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width)
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height)
    await page.keyboard.press('Escape')
  }
})

test('long Unicode Tag completion remains readable in light and dark themes', async ({ page }) => {
  const source = await openEditor(page)
  const tooltip = page.locator('.cm-tooltip-autocomplete')
  const option = tooltip.getByRole('option', { name: /国际化-标签-非常非常长/ })

  for (const theme of ['light', 'dark']) {
    await page.locator('html').evaluate((element, nextTheme) => {
      element.setAttribute('data-theme', nextTheme)
    }, theme)
    await source.fill(`${theme} #国际`)
    await expect(tooltip).toBeVisible()
    await expect(option).toBeVisible()
    await expect(option).toContainText('国际化-标签-非常非常长')
    await expect(option).toBeInViewport({ ratio: 1 })
    await page.keyboard.press('Escape')
  }
})
