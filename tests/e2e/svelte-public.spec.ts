import { expect, test } from './fixture'

test('public Svelte Artifact shows a clear JavaScript requirement without a static snapshot and mounts directly into page DOM', async ({ browser, page }) => {
  const noJavascript = await browser.newContext({ javaScriptEnabled: false })
  const staticPage = await noJavascript.newPage()
  try {
    await staticPage.goto('/svelte-public')
    await expect(staticPage.locator('[data-koala-artifact-root]')).toHaveAttribute('data-koala-render-state', 'loading')
    await expect(staticPage.getByText('This application requires JavaScript.')).toBeVisible()
    await expect(staticPage.locator('[data-koala-artifact-snapshot]')).toHaveCount(0)
  }
  finally {
    await noJavascript.close()
  }

  await page.goto('/svelte-public')
  const root = page.locator('[data-koala-artifact-root]')
  await expect(root).toHaveAttribute('data-koala-render-state', 'mounted')
  await expect(page.locator('[data-koala-artifact-snapshot]')).toHaveCount(0)
  await expect(page.locator('[data-koala-artifact-live]')).toBeVisible()
  await expect(page.locator('#live-artifact')).toHaveText('Live Artifact')
})
