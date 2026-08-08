import { expect, test } from './fixture'

async function openEditor(page: import('@playwright/test').Page) {
  await page.goto('/dashboard/edit?path=/phase-two')
  await page.waitForLoadState('networkidle')
}

test('mobile workspace keeps compact identity, Source/Preview actions, and inline Path editing reachable', async ({ page }) => {
  await openEditor(page)

  for (const viewport of [{ width: 393, height: 727 }, { width: 320, height: 640 }]) {
    await page.setViewportSize(viewport)
    const toolbar = page.getByTestId('editor-toolbar')
    await expect(toolbar.getByTestId('editor-path-edit')).toBeInViewport({ ratio: 1 })
    await expect(toolbar.getByRole('button', { name: 'More File actions' })).toBeInViewport({ ratio: 1 })
    await expect(toolbar.getByRole('button', { name: 'Save File' })).toBeInViewport({ ratio: 1 })
    await expect(toolbar.getByRole('button', { name: 'source' })).toBeInViewport({ ratio: 1 })
    await expect(toolbar.getByRole('button', { name: 'preview' })).toBeInViewport({ ratio: 1 })
    await expect(toolbar.getByRole('button', { name: 'split' })).toBeHidden()

    await toolbar.getByRole('button', { name: 'preview' }).click()
    await expect(page.getByRole('article', { name: 'Markdown Preview' })).toBeVisible()
    await toolbar.getByRole('button', { name: 'source' }).click()
    await expect(page.getByRole('textbox', { name: 'File Source for /phase-two' })).toBeVisible()

    await toolbar.getByRole('button', { name: 'More File actions' }).click()
    const menu = page.getByRole('menu', { name: 'More File actions' })
    await expect(menu.getByRole('menuitem', { name: 'Upload Image' })).toBeVisible()
    await expect(menu.getByRole('menuitem', { name: 'Copy File Reference' })).toBeVisible()
    await expect(menu.getByRole('menuitem', { name: 'Rename / Move' })).toHaveCount(0)
    await expect(menu.getByRole('menuitem', { name: 'Move to recycle bin' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden()
  }
})

test('touch scrolling stays inside the Source editor on a narrow screen', async ({ page }) => {
  await openEditor(page)

  const source = page.getByRole('textbox', { name: 'File Source for /phase-two' })
  const scroller = page.locator('.cm-scroller')
  const longSource = Array.from({ length: 100 }, (_, index) => `line ${index + 1}`).join('\n')
  await source.fill(longSource)
  await scroller.evaluate((element) => {
    element.scrollTop = 0
  })

  const box = await scroller.boundingBox()
  if (!box)
    throw new Error('File Source has no bounding box')
  const client = await page.context().newCDPSession(page)
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await client.send('Input.synthesizeScrollGesture', {
    x,
    y,
    yDistance: -400,
    gestureSourceType: 'touch',
    speed: 800,
  })
  await client.detach()

  await expect.poll(() => scroller.evaluate(element => element.scrollTop)).toBeGreaterThan(0)
  await expect(page.locator('.cm-gutters')).toBeHidden()
})

test('an explicit File Explorer preference remains open on mobile startup', async ({ page }) => {
  await openEditor(page)
  await page.evaluate(() => localStorage.setItem('koala-editor-sidebar-v2', 'true'))

  await page.reload()
  await page.waitForLoadState('networkidle')

  await expect(page.getByTestId('editor-sidebar')).toHaveClass(/\bw-64\b/)
})

test('selecting the current File closes the mobile File Explorer without adding a history entry', async ({ page }) => {
  await openEditor(page)
  await page.setViewportSize({ width: 393, height: 727 })
  await page.getByRole('button', { name: 'Toggle sidebar' }).click()
  await expect(page.getByTestId('editor-sidebar')).toHaveClass(/\bw-64\b/)

  await page.getByRole('button', { name: 'phase-two', exact: true }).click()
  await expect(page.getByTestId('editor-sidebar')).toHaveClass(/\bw-0\b/)
  await expect(page).toHaveURL(/\/dashboard\/edit\?path=%2Fphase-two$/)
})

test('mobile File References navigate in the workspace without exposing the desktop Peek', async ({ page }) => {
  await openEditor(page)

  const source = page.getByRole('textbox', { name: 'File Source for /phase-two' })
  await source.fill('Open [[/second]]')
  await page.getByRole('button', { name: 'preview' }).click()

  const reference = page.locator('#preview-md a[data-file-reference="/second"]')
  await reference.focus()
  await expect(page.getByTestId('file-reference-peek')).toHaveCount(0)
  await reference.click()

  await expect(page).toHaveURL(/\/dashboard\/edit\?path=%2Fsecond$/)
  await expect(page.getByRole('textbox', { name: 'File Source for /second' })).toBeFocused()
})

test('touch editable surfaces keep a 16px font size, including File Finder and inline File Path', async ({ page }) => {
  await openEditor(page)
  await page.setViewportSize({ width: 393, height: 727 })

  const source = page.getByRole('textbox', { name: 'File Source for /phase-two' })
  await expect(source).toHaveCSS('font-size', '16px')

  await page.keyboard.press('Meta+k')
  const finder = page.getByRole('combobox', { name: 'Find a File' })
  await expect(finder).toHaveCSS('font-size', '16px')
  await finder.press('Escape')

  await page.getByTestId('editor-path-edit').click()
  await expect(page.getByRole('textbox', { name: 'File Path' })).toHaveCSS('font-size', '16px')
})
