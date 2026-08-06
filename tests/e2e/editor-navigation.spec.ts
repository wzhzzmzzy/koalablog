import { expect, test } from './fixture'

test('File tree opens and browser Back/Forward replay the shared workspace history', async ({ page }) => {
  await page.goto('/dashboard/edit?path=/phase-two')
  await page.waitForLoadState('networkidle')

  await page.getByRole('button', { name: 'second', exact: true }).click()
  await expect(page).toHaveURL(/\/dashboard\/edit\?path=%2Fsecond$/)
  await expect(page.getByRole('textbox', { name: 'File Source for /second' })).toBeFocused()

  await page.goBack()
  await expect(page).toHaveURL(/\/dashboard\/edit\?path=%2Fphase-two$/)
  await expect(page.getByRole('textbox', { name: 'File Source for /phase-two' })).toBeFocused()

  await page.goForward()
  await expect(page).toHaveURL(/\/dashboard\/edit\?path=%2Fsecond$/)
  await expect(page.getByRole('textbox', { name: 'File Source for /second' })).toBeFocused()
})

test('More has keyboard navigation and returns focus to its trigger', async ({ page }) => {
  await page.goto('/dashboard/edit?path=/phase-two')
  await page.waitForLoadState('networkidle')

  const trigger = page.getByRole('button', { name: 'More File actions' })
  await trigger.click()
  const menu = page.getByRole('menu', { name: 'More File actions' })
  await expect(menu.getByRole('menuitem', { name: 'Back to Dashboard' })).toBeFocused()
  await page.keyboard.press('End')
  await expect(menu.getByRole('menuitem', { name: 'Move to recycle bin' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()
  await expect(trigger).toBeFocused()
})
