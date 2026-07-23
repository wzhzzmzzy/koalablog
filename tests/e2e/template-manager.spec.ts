import { expect, test } from '@playwright/test'

test('Template Manager previews and persists the memo Template Renderer', async ({ page }) => {
  await page.goto('/dashboard/template')
  await page.waitForLoadState('networkidle')

  await expect(page.getByRole('heading', { name: 'Creation Templates' })).toBeVisible()
  const renderer = page.getByRole('combobox', { name: 'Renderer' })
  const preview = page.getByRole('complementary', { name: 'Preview' })
  await expect(renderer).toHaveValue('markdown')
  await expect(preview.getByText('Markdown', { exact: true })).toBeVisible()

  await renderer.selectOption('svelte')
  await expect(page.getByText('Unsaved changes')).toBeVisible()
  await expect(preview.getByText('Svelte', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Save Catalog' }).click()
  await expect(page.getByText('Template Catalog saved.')).toBeVisible()

  await page.reload()
  await page.waitForLoadState('networkidle')
  await expect(page.getByRole('combobox', { name: 'Renderer' })).toHaveValue('svelte')
  await expect(page.getByRole('complementary', { name: 'Preview' }).getByText('Svelte', { exact: true })).toBeVisible()

  await page.getByRole('combobox', { name: 'Renderer' }).selectOption('markdown')
  await page.getByRole('button', { name: 'Save Catalog' }).click()
  await expect(page.getByText('Template Catalog saved.')).toBeVisible()
})
