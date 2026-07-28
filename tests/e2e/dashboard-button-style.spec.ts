import { expect, test } from './fixture'

test('uses plain component-controlled borders for dashboard buttons', async ({ page }) => {
  await page.goto('/dashboard/settings')

  const primaryButton = page.getByRole('button', { name: 'Update password' })
  const primaryStyle = await primaryButton.evaluate((button) => {
    const style = getComputedStyle(button)
    return {
      appearance: style.appearance,
      border: style.border,
      boxShadow: style.boxShadow,
    }
  })

  expect(primaryStyle.appearance).toBe('none')
  expect(primaryStyle.border).toMatch(/^1px solid/)
  expect(primaryStyle.boxShadow).toBe('none')

  const selectedFlavor = page.locator('.theme-flavor-option[aria-pressed="true"]').first()
  const selectedFlavorStyle = await selectedFlavor.evaluate((button) => {
    const style = getComputedStyle(button)
    return {
      border: style.border,
      boxShadow: style.boxShadow,
    }
  })

  expect(selectedFlavorStyle.border).toMatch(/^1px solid/)
  expect(selectedFlavorStyle.boxShadow).toBe('none')
})
