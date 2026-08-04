import { expect, test } from './fixture'

async function openEditor(page: import('@playwright/test').Page) {
  await page.goto('/dashboard/edit?path=/phase-two')
  await page.waitForLoadState('networkidle')
}

function instantSearch(page: import('@playwright/test').Page) {
  return page.getByRole('searchbox', { name: 'Search Files' })
}

test('Cmd+K opens File Explorer, focuses Instant Search, and restores the tree after Escape', async ({ page }) => {
  await openEditor(page)

  await page.getByRole('button', { name: 'Toggle sidebar' }).click()
  await expect(page.getByTestId('editor-sidebar')).toHaveClass(/\bw-0\b/)

  await page.keyboard.press('Meta+k')
  const search = instantSearch(page)
  await expect(search).toBeFocused()
  await expect(page.getByTestId('editor-sidebar')).toHaveClass(/\bw-64\b/)

  await search.fill('path-findable')
  const result = page.locator('.editor-search-result').filter({ hasText: 'path-findable' })
  await expect(result).toBeVisible()
  await expect(result).toContainText('Path')
  await expect(page.getByRole('button', { name: 'second', exact: true })).toBeHidden()

  await result.click()
  await expect(page.getByRole('textbox', { name: 'File Source for /search/path-findable' })).toBeVisible()
  await expect(search).toHaveValue('path-findable')
  await expect(result).toBeVisible()

  await search.press('Escape')
  await expect(search).toHaveValue('')
  await expect(page.getByRole('button', { name: 'second', exact: true })).toBeVisible()
})

test('Instant Search ranks Path, Tag, and Source, excludes frontmatter and trash, and searches Svelte Source', async ({ page }) => {
  await openEditor(page)
  const search = instantSearch(page)

  await search.fill('findable')
  const results = page.locator('.editor-search-result')
  await expect(results).toHaveCount(3)
  await expect(results.nth(0)).toContainText('path-findable')
  await expect(results.nth(0)).toContainText('Path')
  await expect(results.nth(1)).toContainText('tag-only')
  await expect(results.nth(1)).toContainText('Tag')
  await expect(results.nth(1)).toContainText('#findable-tag')
  await expect(results.nth(2)).toContainText('source-only')
  await expect(results.nth(2)).toContainText('Source')
  await expect(results.nth(2)).toContainText('2 matches')

  await search.fill('Read-only Source')
  await expect(page.getByText('No matching active Files')).toBeVisible()

  await search.fill('Hidden Search Meta')
  await expect(page.getByText('No matching active Files')).toBeVisible()
  await search.fill('Visible frontmatter-free body')
  await expect(page.locator('.editor-search-result').filter({ hasText: 'meta-hidden' })).toBeVisible()

  await search.fill('svelteSearchNeedle')
  const svelte = page.locator('.editor-search-result').filter({ hasText: 'svelte-source' })
  await expect(svelte).toBeVisible()
  await expect(svelte).toContainText('Source')
})

test('Instant Search immediately reflects dirty Path, Tag, and Source edits', async ({ page }) => {
  await openEditor(page)

  const source = page.getByRole('textbox', { name: 'File Source for /phase-two' })
  const path = page.getByRole('textbox', { name: 'Absolute File Path' })
  await source.fill('#instant-find-tag\nUnsaved search body')
  await path.fill('/search/dirty-path')

  await page.keyboard.press('Meta+k')
  const search = instantSearch(page)
  await expect(search).toBeFocused()

  await search.fill('dirty-path')
  let result = page.locator('.editor-search-result').filter({ hasText: 'dirty-path' })
  await expect(result).toBeVisible()
  await expect(result).toContainText('Path')
  await expect(result.locator('.editor-file-tree__dirty')).toBeVisible()

  await search.fill('instant-find-tag')
  result = page.locator('.editor-search-result').filter({ hasText: 'instant-find-tag' })
  await expect(result).toBeVisible()
  await expect(result).toContainText('Tag')
  await expect(result).toContainText('Source')

  await search.fill('Unsaved search body')
  result = page.locator('.editor-search-result').filter({ hasText: 'dirty-path' })
  await expect(result).toContainText('Unsaved search body')
  await expect(result).toContainText('Source')
})
