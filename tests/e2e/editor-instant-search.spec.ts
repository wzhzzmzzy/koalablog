import { expect, test } from './fixture'

async function openEditor(page: import('@playwright/test').Page) {
  await page.goto('/dashboard/edit?path=/phase-two')
  await page.waitForLoadState('networkidle')
}

function fileFinder(page: import('@playwright/test').Page) {
  return page.getByRole('combobox', { name: 'Find a File' })
}

async function openFileFinder(page: import('@playwright/test').Page) {
  await page.keyboard.press('Meta+k')
  await expect(page.getByRole('dialog', { name: 'Find a File' })).toBeVisible()
  const finder = fileFinder(page)
  await expect(finder).toBeFocused()
  return finder
}

async function renameInBuffer(page: import('@playwright/test').Page, path: string) {
  await page.getByTestId('editor-path-edit').click()
  const input = page.getByRole('textbox', { name: 'File Path' })
  await input.fill(path)
  await input.press('Enter')
}

async function chooseRenderer(page: import('@playwright/test').Page, renderer: 'Markdown' | 'Svelte') {
  await page.getByRole('button', { name: 'More File actions' }).click()
  await page.getByRole('menuitemradio', { name: renderer }).click()
}

test('Cmd+K opens the File Finder, supports keyboard selection, and restores focus after Escape', async ({ page }) => {
  await openEditor(page)

  const source = page.getByRole('textbox', { name: 'File Source for /phase-two' })
  await source.focus()
  await page.getByRole('button', { name: 'Toggle sidebar' }).click()
  await expect(page.getByTestId('editor-sidebar')).toHaveClass(/\bw-0\b/)

  const finder = await openFileFinder(page)
  await expect(finder).toHaveCSS('outline-style', 'none')
  await expect(page.getByTestId('editor-sidebar')).toHaveClass(/\bw-0\b/)
  await expect(page.getByRole('heading', { name: 'Recent' })).toBeVisible()
  await expect(page.getByRole('option', { name: /phase-two/ })).toBeVisible()
  await expect(page.getByRole('searchbox', { name: 'Search Files' })).toHaveCount(0)

  await finder.fill('path-findable')
  const result = page.getByRole('option', { name: /path-findable/ })
  await expect(result).toBeVisible()
  await expect(result).toContainText('path')
  await finder.press('Enter')

  await expect(page.getByRole('dialog', { name: 'Find a File' })).toBeHidden()
  await expect(page.getByRole('textbox', { name: 'File Source for /search/path-findable' })).toBeFocused()

  const openedSource = page.getByRole('textbox', { name: 'File Source for /search/path-findable' })
  await openedSource.focus()
  const reopenedFinder = await openFileFinder(page)
  await reopenedFinder.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Find a File' })).toBeHidden()
  await expect(openedSource).toBeFocused()
})

test('opening another File from Svelte Preview exits the old full-screen preview', async ({ page }) => {
  await openEditor(page)
  await chooseRenderer(page, 'Svelte')
  await page.getByRole('button', { name: 'Preview File' }).click()
  await expect(page.getByTestId('editor-preview-overlay')).toBeVisible()

  const finder = await openFileFinder(page)
  await finder.fill('second')
  await expect(page.getByRole('option', { name: /second/ })).toBeVisible()
  await finder.press('Enter')

  const source = page.getByRole('textbox', { name: 'File Source for /second' })
  await expect(page.getByTestId('editor-preview-overlay')).toBeHidden()
  await expect(source).toBeVisible()
  await expect(source).toBeFocused()
})

test('File Finder ranks literal Path, Tag, and Source results while excluding frontmatter and recycled Files', async ({ page }) => {
  await openEditor(page)
  const finder = await openFileFinder(page)

  await finder.fill('findable')
  const results = page.getByRole('option')
  await expect(results).toHaveCount(3)
  await expect(results.nth(0)).toContainText('path-findable')
  await expect(results.nth(0)).toContainText('path')
  await expect(results.nth(1)).toContainText('tag-only')
  await expect(results.nth(1)).toContainText('tag')
  await expect(results.nth(2)).toContainText('source-only')
  await expect(results.nth(2)).toContainText('source')

  await finder.press('ArrowDown')
  await expect(results.nth(1)).toHaveAttribute('aria-selected', 'true')
  await finder.fill('FINDABLE')
  await expect(results.nth(0)).toHaveAttribute('aria-selected', 'true')

  await finder.fill('Read-only Source')
  await expect(page.getByText('No matching active Files')).toBeVisible()

  await finder.fill('Hidden Search Meta')
  await expect(page.getByText('No matching active Files')).toBeVisible()
  await finder.fill('Visible frontmatter-free body')
  await expect(page.getByRole('option', { name: /meta-hidden/ })).toBeVisible()

  await finder.fill('svelteSearchNeedle')
  const svelte = page.getByRole('option', { name: /svelte-source/ })
  await expect(svelte).toBeVisible()
  await expect(svelte).toContainText('source')
})

test('File Finder reflects dirty Path, Tag, and Source edits and prioritizes Local changes', async ({ page }) => {
  await openEditor(page)

  const source = page.getByRole('textbox', { name: 'File Source for /phase-two' })
  await source.fill('#instant-find-tag\nUnsaved search body')
  await renameInBuffer(page, '/search/dirty-path')

  const finder = await openFileFinder(page)
  await expect(page.getByRole('heading', { name: 'Local changes' })).toBeVisible()
  await expect(page.getByRole('option', { name: /dirty-path/ }).locator('.editor-file-tree__dirty')).toBeVisible()

  await finder.fill('dirty-path')
  let result = page.getByRole('option', { name: /dirty-path/ })
  await expect(result).toContainText('path')

  await finder.fill('instant-find-tag')
  result = page.getByRole('option', { name: /dirty-path/ })
  await expect(result).toContainText('tag')

  await finder.fill('Unsaved search body')
  result = page.getByRole('option', { name: /dirty-path/ })
  await expect(result).toContainText('source')
})
