import { expect, test } from './fixture'

async function openEditor(page: import('@playwright/test').Page, path = '/phase-two') {
  await page.goto(`/dashboard/edit?path=${encodeURIComponent(path)}`)
  await page.waitForLoadState('networkidle')
}

function previewReference(page: import('@playwright/test').Page, path: string) {
  return page.locator('#preview-md a[data-file-reference]', { hasText: path })
}

test('Markdown Preview File Reference opens in the workspace and shares Toolbar and browser history', async ({ page }) => {
  await openEditor(page)

  const phaseTwoSource = page.getByRole('textbox', { name: 'File Source for /phase-two' })
  await phaseTwoSource.fill('Open [[/second]]')
  await page.getByRole('button', { name: 'preview' }).click()

  await previewReference(page, '/second').click()
  await expect(page).toHaveURL(/\/dashboard\/edit\?path=%2Fsecond$/)
  await expect(page.getByRole('textbox', { name: 'File Source for /second' })).toBeFocused()

  await page.getByRole('button', { name: 'Back to previous File' }).click()
  await expect(page).toHaveURL(/\/dashboard\/edit\?path=%2Fphase-two$/)
  await expect(phaseTwoSource).toContainText('Open [[/second]]')

  await page.goForward()
  await expect(page).toHaveURL(/\/dashboard\/edit\?path=%2Fsecond$/)
  await expect(page.getByRole('textbox', { name: 'File Source for /second' })).toBeFocused()
})

test('Markdown Split File References use the same workspace navigation path', async ({ page }) => {
  await openEditor(page)

  const source = page.getByRole('textbox', { name: 'File Source for /phase-two' })
  await source.fill('Split [[/second]]')
  await page.getByRole('button', { name: 'split' }).click()
  await expect(previewReference(page, '/second')).toBeVisible()

  await previewReference(page, '/second').click()
  await expect(page).toHaveURL(/\/dashboard\/edit\?path=%2Fsecond$/)
  await expect(page.getByRole('textbox', { name: 'File Source for /second' })).toBeFocused()
})

test('File Reference navigation restores the target Edit Buffer and CodeMirror scroll state', async ({ page }) => {
  await openEditor(page, '/second')

  const secondSource = page.getByRole('textbox', { name: 'File Source for /second' })
  const longSource = Array.from({ length: 120 }, (_, index) => `second line ${index + 1}`).join('\n')
  await secondSource.fill(longSource)
  const scroller = page.locator('.cm-scroller')
  await scroller.hover()
  await page.mouse.wheel(0, 2400)
  await expect.poll(() => scroller.evaluate(element => element.scrollTop)).toBeGreaterThan(0)
  const savedScrollTop = await scroller.evaluate(element => element.scrollTop)

  await page.getByRole('button', { name: 'phase-two', exact: true }).click()
  const phaseTwoSource = page.getByRole('textbox', { name: 'File Source for /phase-two' })
  await phaseTwoSource.fill('Return to [[/second]]')
  await page.getByRole('button', { name: 'preview' }).click()
  await previewReference(page, '/second').click()

  await expect(secondSource).toContainText('second line 120')
  await expect.poll(() => scroller.evaluate(element => element.scrollTop)).toBeGreaterThan(savedScrollTop / 2)
})

test('desktop File Reference hover and keyboard focus expose a read-only Peek', async ({ page }) => {
  await openEditor(page)

  const source = page.getByRole('textbox', { name: 'File Source for /phase-two' })
  await source.fill('Peek [[/second]]')
  await page.getByRole('button', { name: 'preview' }).click()

  const reference = previewReference(page, '/second')
  await reference.hover()
  const peek = page.getByRole('tooltip', { name: 'Peek /second' })
  await expect(peek).toBeVisible()
  await expect(peek).toContainText('Second file')

  await page.mouse.move(0, 0)
  await expect(peek).toBeHidden()
  await reference.focus()
  await expect(peek).toBeVisible()
})

test('a missing File Reference keeps the workspace open and exposes a Missing File state', async ({ page }) => {
  await openEditor(page)

  const source = page.getByRole('textbox', { name: 'File Source for /phase-two' })
  await source.fill('Broken [[/does-not-exist]]')
  await page.getByRole('button', { name: 'preview' }).click()

  const reference = previewReference(page, '/does-not-exist')
  await expect(reference).not.toHaveAttribute('href')
  await reference.click()

  await expect(page).toHaveURL(/\/dashboard\/edit\?path=%2Fphase-two$/)
  await expect(page.getByTestId('missing-file-reference')).toHaveText('Missing File /does-not-exist')
})
