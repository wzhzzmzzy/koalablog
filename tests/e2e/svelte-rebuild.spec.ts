import { expect, test } from './fixture'

test('browser batch rebuild records success and dependency drift without auto-confirming it', async ({ page }) => {
  test.setTimeout(180_000)
  await page.goto('/dashboard/rebuild')

  const drift = page.locator('[data-rebuild-path="/svelte-drift"]')
  const publicFile = page.locator('[data-rebuild-path="/svelte-public"]')
  await expect(drift).toHaveAttribute('data-rebuild-status', 'queued')
  await expect(publicFile).toHaveAttribute('data-rebuild-status', 'queued')

  await page.getByRole('button', { name: 'Start rebuild' }).click()

  await expect(drift).toHaveAttribute('data-rebuild-status', 'dependency_changed', { timeout: 120_000 })
  await expect(publicFile).toHaveAttribute('data-rebuild-status', 'success', { timeout: 120_000 })
  await expect(drift.getByText('This utility never confirms it.')).toBeVisible()
  await expect(drift.getByRole('button', { name: 'Retry build' })).toHaveCount(0)
})
