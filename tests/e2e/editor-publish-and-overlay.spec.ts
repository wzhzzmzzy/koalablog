import { expect, test } from './fixture'

async function openEditor(page: import('@playwright/test').Page) {
  await page.goto('/dashboard/edit?path=/phase-two')
  await page.waitForLoadState('networkidle')
}

test('Preview occupies the viewport and returns to Source editing', async ({ page }) => {
  await openEditor(page)

  await page.getByRole('button', { name: 'Preview File' }).click()

  const preview = page.getByTestId('editor-preview-overlay')
  await expect(preview).toBeVisible()
  expect(await preview.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    return {
      height: rect.height,
      left: rect.left,
      top: rect.top,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
      width: rect.width,
    }
  })).toEqual({
    height: await page.evaluate(() => window.innerHeight),
    left: 0,
    top: 0,
    viewportHeight: await page.evaluate(() => window.innerHeight),
    viewportWidth: await page.evaluate(() => window.innerWidth),
    width: await page.evaluate(() => window.innerWidth),
  })
  expect(await preview.evaluate((element) => {
    const topLeftContent = document.elementFromPoint(8, window.innerHeight / 2)
    return topLeftContent ? element.contains(topLeftContent) : false
  })).toBe(true)

  await preview.getByRole('button', { name: 'Edit Source' }).click()
  await expect(page.getByRole('textbox', { name: 'File Source for /phase-two' })).toBeFocused()
})

test('File deletion uses a native viewport backdrop', async ({ page }) => {
  await openEditor(page)

  await page.getByRole('button', { name: 'Move to recycle bin' }).click()

  const dialog = page.getByRole('dialog', { name: 'Move to recycle bin?' })
  await expect(dialog).toHaveAttribute('open', '')
  expect(await dialog.evaluate((element) => {
    const backdrop = getComputedStyle(element, '::backdrop')
    return {
      bottom: backdrop.bottom,
      left: backdrop.left,
      position: backdrop.position,
      right: backdrop.right,
      top: backdrop.top,
    }
  })).toEqual({
    bottom: '0px',
    left: '0px',
    position: 'fixed',
    right: '0px',
    top: '0px',
  })
})

test('Path focus stays visually quiet and Svelte files use Svelte icons', async ({ page }) => {
  await openEditor(page)

  const path = page.getByRole('textbox', { name: 'Absolute File Path' })
  const context = path.locator('..')
  const borderBeforeFocus = await context.evaluate(element => getComputedStyle(element).borderColor)
  await path.focus()
  await expect(path).toBeFocused()
  expect(await path.evaluate(element => getComputedStyle(element).outlineStyle)).toBe('none')
  expect(await context.evaluate(element => getComputedStyle(element).borderColor)).toBe(borderBeforeFocus)

  await page.getByRole('radio', { name: 'Svelte' }).check()
  await expect(page.getByTestId('editor-path-file-icon')).toHaveAttribute('data-renderer', 'svelte')
  await expect(page.getByTestId('editor-title-file-icon')).toHaveAttribute('data-renderer', 'svelte')
})

test('saving a Svelte File deploys its current Artifact to the public site', async ({ page }) => {
  test.setTimeout(180_000)
  await openEditor(page)

  await page.getByRole('radio', { name: 'Svelte' }).check()
  const source = page.getByRole('textbox', { name: 'File Source for /phase-two' })
  await source.fill('<h1>Published immediately</h1>')
  await page.getByRole('button', { name: 'Save File' }).click()

  await expect(page.getByText('Saved and deployed to the site.')).toBeVisible({ timeout: 120_000 })
  await page.goto('/phase-two')
  await expect(page.getByRole('heading', { name: 'Published immediately' })).toBeVisible()
})

test('saving a Svelte File resumes automatic deployment after a page reload', async ({ page }) => {
  test.setTimeout(180_000)
  await openEditor(page)

  await page.getByRole('radio', { name: 'Svelte' }).check()
  const source = page.getByRole('textbox', { name: 'File Source for /phase-two' })
  await source.fill('<h1>Recovered deployment</h1>')
  await page.getByRole('button', { name: 'Save File' }).click()
  await expect(page.getByText('Source saved. Deploying to the site…')).toBeVisible()

  await page.reload()
  await page.waitForLoadState('networkidle')
  await expect(page.getByText('Saved and deployed to the site.')).toBeVisible({ timeout: 120_000 })
  await page.goto('/phase-two')
  await expect(page.getByRole('heading', { name: 'Recovered deployment' })).toBeVisible()
})
