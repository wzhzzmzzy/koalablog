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

test('Deploy shows storage modes separately from rebuilding and does not mount a hidden preview', async ({ page }) => {
  await page.goto('/dashboard/rebuild')
  await expect(page.getByRole('heading', { name: 'Artifact storage', exact: true })).toBeVisible()
  const files = page.getByRole('list', { name: 'Artifact storage Files' })
  await expect(files).toContainText('/svelte-public')
  await expect(files).toContainText('D1')
  await expect(page.getByText('R2 is unavailable:', { exact: false })).toBeVisible()
  await expect(page.locator('[data-koala-svelte-preview]')).toHaveCount(0)
  await expect(page.getByRole('combobox', { name: 'Artifact storage mode', exact: true })).toHaveValue('preserve')
  await expect(page.getByLabel('Destination')).toBeVisible()
})
