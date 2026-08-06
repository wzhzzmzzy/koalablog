import { expect, test } from './fixture'

async function openEditor(page: import('@playwright/test').Page) {
  await page.goto('/dashboard/edit?path=/phase-two')
  await page.waitForLoadState('networkidle')
}

async function chooseRenderer(page: import('@playwright/test').Page, renderer: 'Markdown' | 'Svelte') {
  await page.getByRole('button', { name: 'More File actions' }).click()
  await page.getByRole('menuitemradio', { name: renderer }).click()
}

async function chooseMoreAction(page: import('@playwright/test').Page, name: string) {
  await page.getByRole('button', { name: 'More File actions' }).click()
  await page.getByRole('menuitem', { name }).click()
}

test('Preview occupies the viewport and returns to Source editing', async ({ page }) => {
  await openEditor(page)

  await chooseRenderer(page, 'Svelte')
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

  await chooseMoreAction(page, 'Move to recycle bin')

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

test('File Path uses inline editing and Svelte Files use Svelte icons', async ({ page }) => {
  await openEditor(page)

  await expect(page.getByRole('textbox', { name: 'Absolute File Path' })).toHaveCount(0)
  await expect(page.getByTestId('editor-path-edit')).toHaveAttribute('class', /editor-path-display/)

  await chooseRenderer(page, 'Svelte')
  await expect(page.getByTestId('editor-path-file-icon')).toHaveAttribute('data-renderer', 'svelte')
  await expect(page.getByTestId('editor-title-file-icon')).toHaveAttribute('data-renderer', 'svelte')
})

test('saving Svelte Source requires an explicit Deploy before it reaches the public site', async ({ page }) => {
  test.setTimeout(180_000)
  await openEditor(page)

  await chooseRenderer(page, 'Svelte')
  const source = page.getByRole('textbox', { name: 'File Source for /phase-two' })
  await source.fill('<h1>Published immediately</h1>')
  await page.getByRole('button', { name: 'Save File' }).click()

  await expect(page.getByText('Source saved.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Deploy' })).toBeVisible()
  const unavailable = await page.goto('/phase-two')
  expect(unavailable?.status()).toBe(503)

  await page.goto('/dashboard/edit?path=/phase-two')
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: 'Deploy' }).click()
  await expect(page.getByText('Svelte File deployed to the site.')).toBeVisible({ timeout: 120_000 })
  await page.goto('/phase-two')
  await expect(page.getByRole('heading', { name: 'Published immediately' })).toBeVisible()
})

test('reloading saved Svelte Source does not resume deployment automatically', async ({ page }) => {
  await openEditor(page)

  await chooseRenderer(page, 'Svelte')
  const source = page.getByRole('textbox', { name: 'File Source for /phase-two' })
  await source.fill('<h1>Recovered deployment</h1>')
  await page.getByRole('button', { name: 'Save File' }).click()
  await expect(page.getByText('Source saved.')).toBeVisible()

  await page.reload()
  await page.waitForLoadState('networkidle')
  await expect(page.getByRole('button', { name: 'Deploy' })).toBeVisible()
  await page.goto('/phase-two')
  await expect(page.getByRole('heading', { name: 'Recovered deployment' })).toHaveCount(0)
})
