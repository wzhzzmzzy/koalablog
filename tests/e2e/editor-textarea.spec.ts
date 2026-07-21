import { expect, test } from '@playwright/test'

test('File Source exposes the stable editor contract on the textarea baseline', async ({ page }) => {
  await page.goto('/dashboard/edit?path=/phase-two')
  await page.waitForLoadState('networkidle')

  const source = page.getByRole('textbox', { name: 'File Source for /phase-two' })
  await expect(source).toHaveValue('First line\nSecond line')

  await source.focus()
  await page.keyboard.press('End')
  await page.keyboard.type(' updated')

  await expect(source).toHaveValue('First line\nSecond line updated')
})

test('FileEditor saves exactly once from Path and Source while preserving focus', async ({ page }) => {
  const saveRequests: string[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes('/_actions/form.save'))
      saveRequests.push(request.url())
  })

  await page.goto('/dashboard/edit?path=/phase-two')
  await page.waitForLoadState('networkidle')
  const path = page.getByRole('textbox', { name: 'Absolute File Path' })
  const source = page.getByRole('textbox', { name: 'File Source for /phase-two' })

  await path.focus()
  await page.keyboard.press('Control+s')
  await expect(page.getByText('Saved Success')).toBeVisible()
  await expect(path).toBeFocused()
  expect(saveRequests).toHaveLength(1)

  await source.focus()
  await page.keyboard.press('Meta+s')
  await expect.poll(() => saveRequests.length).toBe(2)
  await expect(source).toBeFocused()
})

test('a recycled File exposes a read-only Source editor', async ({ page }) => {
  await page.goto('/dashboard/edit?id=2')
  await page.waitForLoadState('networkidle')

  const source = page.getByRole('textbox', { name: 'File Source for /trashed' })
  await expect(source).toHaveValue('Read-only Source')
  await expect(source).toHaveAttribute('readonly', '')
  await source.pressSequentially(' changed')
  await expect(source).toHaveValue('Read-only Source')
})
