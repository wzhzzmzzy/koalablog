import { expect, test } from './fixture'

async function startDeployment(page: import('@playwright/test').Page) {
  // The first browser Worker import can make Vite optimize Worker dependencies and
  // reload the dev page. Production bundles do not perform that optimization.
  const workerLoadReloadedPage = page.waitForEvent('framenavigated', {
    predicate: frame => frame === page.mainFrame(),
  }).then(() => true)
  await page.getByRole('button', { name: 'Start deployment' }).click()
  const reloaded = await Promise.race([
    workerLoadReloadedPage,
    page.waitForTimeout(5_000).then(() => false),
  ])
  if (!reloaded)
    return
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: 'Start deployment' }).click()
}

test('browser batch rebuild records success and dependency drift without auto-confirming it', async ({ page }) => {
  test.setTimeout(180_000)
  await page.goto('/dashboard/rebuild')

  const drift = page.locator('[data-rebuild-path="/svelte-drift"]')
  const publicFile = page.locator('[data-rebuild-path="/svelte-public"]')
  await expect(drift).toHaveAttribute('data-rebuild-status', 'queued')
  await expect(publicFile).toHaveAttribute('data-rebuild-status', 'queued')

  await startDeployment(page)

  await expect(drift).toHaveAttribute('data-rebuild-status', 'dependency_changed', { timeout: 120_000 })
  await expect(publicFile).toHaveAttribute('data-rebuild-status', 'success', { timeout: 120_000 })
  await expect(drift.getByText('This utility never confirms it.')).toBeVisible()
  await expect(drift.getByRole('button', { name: 'Retry build' })).toHaveCount(0)
})
