import path from 'node:path'
import process from 'node:process'
import { createClient } from '@libsql/client'
import { expect, test } from './fixture'

test('Settings migrates legacy snapshots with explicit acknowledgement and keeps public apps running', async ({ page }) => {
  const db = createClient({ url: `file:${path.join(process.cwd(), '.playwright/local.db')}` })
  try {
    await db.batch([
      'ALTER TABLE markdown_render DROP COLUMN javascriptKey',
      'ALTER TABLE markdown_render DROP COLUMN cssKey',
      'ALTER TABLE markdown_render ADD COLUMN snapshotHtml text NOT NULL DEFAULT \'\'',
      'UPDATE markdown_render SET schemaVersion = 1, snapshotHtml = \'<p>obsolete static body</p>\'',
      'DELETE FROM __drizzle_migrations WHERE created_at = 1792659600000',
    ], 'write')
    const before = await db.execute('SELECT * FROM markdown ORDER BY id')
    await page.goto('/svelte-public')
    await expect(page.locator('#live-artifact')).toHaveText('Live Artifact')
    await expect(page.getByText('obsolete static body')).toHaveCount(0)
    await page.goto('/dashboard/settings')
    await page.getByRole('button', { name: 'Check migration status' }).click()
    const button = page.getByRole('button', { name: 'Migrate database and remove snapshots' })
    await expect(button).toBeVisible()
    await expect(button).toBeDisabled()
    await page.getByLabel('I have a recoverable backup and confirm removal of all stored Svelte snapshots.').check()
    await button.click()
    await expect(page.getByText('Database is up to date. Stored snapshots have been removed.')).toBeVisible()
    expect((await db.execute('PRAGMA table_info(markdown_render)')).rows.map(row => row.name)).not.toContain('snapshotHtml')
    expect((await db.execute('SELECT * FROM markdown ORDER BY id')).rows).toEqual(before.rows)
    await page.goto('/svelte-public')
    await expect(page.locator('#live-artifact')).toHaveText('Live Artifact')
  }
  finally {
    const columns = (await db.execute('PRAGMA table_info(markdown_render)')).rows.map(row => row.name)
    for (const column of ['javascriptKey', 'cssKey']) {
      if (!columns.includes(column))
        await db.execute(`ALTER TABLE markdown_render ADD COLUMN ${column} text`)
    }
    if (columns.includes('snapshotHtml'))
      await db.execute('ALTER TABLE markdown_render DROP COLUMN snapshotHtml')
    await db.execute('UPDATE markdown_render SET schemaVersion = 2')
    db.close()
  }
})

test('Deploy shows one metadata list with deployment state, storage and a default for new pages', async ({ page }) => {
  const requests: string[] = []
  page.on('request', request => requests.push(request.url()))
  await page.goto('/dashboard/rebuild')
  await expect(page.getByRole('heading', { name: 'Storage for new pages', exact: true })).toBeVisible()
  const files = page.getByRole('list', { name: 'Existing Svelte pages' })
  await expect(files).toContainText('/svelte-public')
  await expect(files).toContainText('D1')
  await expect(page.getByText('R2 is unavailable:', { exact: false })).toBeVisible()
  await expect(page.locator('[data-koala-svelte-preview]')).toHaveCount(0)
  await expect(page.getByRole('combobox', { name: 'Default storage for new pages' })).toHaveValue('d1')
  const deployed = page.locator('[data-rebuild-path="/svelte-public"]')
  await expect(deployed.locator('[data-deployment-status]')).toHaveText('Deployed')
  await expect(deployed.getByRole('button', { name: 'Move to R2' })).toBeDisabled()
  expect(requests.filter(url => url.includes('/_actions/db.artifactStorage.list'))).toHaveLength(1)
  expect(requests.filter(url => /db\.markdown\.all|db\.editor\.file|svelte\/worker/.test(url))).toEqual([])
})

test('opening Settings does not scan snapshots or preload library Source', async ({ page }) => {
  const requests: string[] = []
  page.on('request', request => requests.push(request.url()))
  await page.goto('/dashboard/settings')
  await expect(page.getByRole('button', { name: 'Check migration status' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Choose File' })).toBeVisible()
  await expect(page.getByRole('switch', { name: 'Enable RSS' })).toBeVisible()
  expect(requests.filter(url => /artifactStorage\.schemaStatus|db\.markdown\.(?:all|paths)/.test(url))).toEqual([])
  await page.getByRole('button', { name: 'Check migration status' }).click()
  await expect(page.getByText('Database is up to date. Stored snapshots have been removed.')).toBeVisible()
  expect(requests.filter(url => url.includes('artifactStorage.schemaStatus'))).toHaveLength(1)
})

test('Deploy refresh recovers from a failed metadata request without enabling writes on stale data', async ({ page }) => {
  await page.route('**/_actions/db.artifactStorage.list/**', route => route.fulfill({ status: 503, body: 'error code: 1102' }))
  await page.goto('/dashboard/rebuild')
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeEnabled()
  await page.unroute('**/_actions/db.artifactStorage.list/**')
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(page.locator('[data-rebuild-path="/svelte-public"]')).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('Deploy distinguishes undeployed changes and unbuilt pages and fits narrow screens', async ({ page }, testInfo) => {
  const db = createClient({ url: `file:${path.join(process.cwd(), '.playwright/local.db')}` })
  try {
    await db.execute('UPDATE markdown SET sourceHash = \'changed-source\' WHERE path = \'/svelte-public\'')
    await db.execute('DELETE FROM markdown_render WHERE fileId = (SELECT id FROM markdown WHERE path = \'/svelte-drift\')')
    await page.goto('/dashboard/rebuild')
    await expect(page.locator('[data-rebuild-path="/svelte-public"] [data-deployment-status]')).toHaveText('Undeployed changes')
    const unbuilt = page.locator('[data-rebuild-path="/svelte-drift"]')
    await expect(unbuilt.locator('[data-deployment-status]')).toHaveText('Not deployed')
    await expect(unbuilt.locator('[data-storage-mode]')).toHaveText('—')
    await expect(unbuilt.getByRole('button', { name: /Move to/ })).toHaveCount(0)
    await page.screenshot({ path: testInfo.outputPath('deploy-desktop.png'), fullPage: true })
    await page.setViewportSize({ width: 390, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    const pathLink = page.locator('[data-rebuild-path="/svelte-public"] a').first()
    expect((await pathLink.boundingBox())!.height).toBeLessThan(40)
    await page.screenshot({ path: testInfo.outputPath('deploy-mobile.png'), fullPage: true })
  }
  finally { db.close() }
})
