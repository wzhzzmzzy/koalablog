import { readFile } from 'node:fs/promises'
import { expect, type Page, test } from '@playwright/test'
import { inArray } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import { strFromU8, unzipSync } from 'fflate'
import { markdown } from '../../src/db/schema'

interface MockDirectory {
  [name: string]: string | MockDirectory
}

test.describe.configure({ timeout: 60_000 })

async function mockDirectoryPicker(page: Page, tree: MockDirectory) {
  await page.addInitScript((root) => {
    function directoryHandle(directory: MockDirectory) {
      return {
        kind: 'directory',
        async *entries() {
          for (const [name, value] of Object.entries(directory)) {
            yield [name, typeof value === 'string'
              ? {
                  kind: 'file',
                  getFile: async () => ({ text: async () => value }),
                }
              : directoryHandle(value)]
          }
        },
      }
    }

    Object.defineProperty(window, 'showDirectoryPicker', {
      configurable: true,
      value: async () => directoryHandle(root),
    })
  }, tree)
}

test('browser import and export preserve mixed nested Renderer files', async ({ page }) => {
  const markdownSource = '---\ncustom: import-smoke\n---\n\nMarkdown body'
  const svelteSource = '<script>const title = "你好"</script>\r\n<h1>{title}</h1>'
  const paths = ['/post/phase-three/note', '/page/phase-three/widget']
  const database = drizzle({ connection: { url: 'file:.playwright/local.db' } })

  try {
    await mockDirectoryPicker(page, {
      post: { 'phase-three': { 'note.md': markdownSource } },
      page: { 'phase-three': { 'widget.svelte': svelteSource } },
    })
    await page.goto('/dashboard/settings')
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: 'Choose File' }).click()
    const importDialog = page.getByRole('dialog', { name: 'Import Files' })
    await expect(page.getByRole('heading', { name: 'Import Files' })).toBeVisible()
    await expect(importDialog.getByText('/post/phase-three/note', { exact: true })).toBeVisible()
    await expect(importDialog.getByText('/page/phase-three/widget', { exact: true })).toBeVisible()
    await importDialog.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Import Files' })).toBeHidden()

    await expect.poll(async () => {
      const rows = await database.select({ path: markdown.path, renderer: markdown.renderer, content: markdown.content })
        .from(markdown)
        .where(inArray(markdown.path, paths))
      return rows.sort((left, right) => left.path.localeCompare(right.path))
    }).toEqual([
      { path: '/page/phase-three/widget', renderer: 'svelte', content: svelteSource },
      { path: '/post/phase-three/note', renderer: 'markdown', content: markdownSource },
    ])

    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Download Zip' }).click()
    const download = await downloadPromise
    const archivePath = await download.path()
    expect(archivePath).not.toBeNull()
    const archive = unzipSync(await readFile(archivePath!))
    expect(strFromU8(archive['post/phase-three/note.md'])).toBe(markdownSource)
    expect(strFromU8(archive['page/phase-three/widget.svelte'])).toBe(svelteSource)
    expect(archive['post/phase-three/note.svelte']).toBeUndefined()
    expect(archive['page/phase-three/widget.md']).toBeUndefined()
  }
  finally {
    await database.delete(markdown).where(inArray(markdown.path, paths))
    database.$client.close()
  }
})

test('browser import reports cross-extension Path collisions before saving', async ({ page }) => {
  let importRequests = 0
  page.on('request', (request) => {
    if (request.url().includes('/_actions/db.markdown.batchImport'))
      importRequests += 1
  })
  await mockDirectoryPicker(page, {
    wiki: {
      'same.md': 'Markdown',
      'same.svelte': '<h1>Svelte</h1>',
    },
  })
  await page.goto('/dashboard/settings')
  await page.waitForLoadState('networkidle')

  await page.getByRole('button', { name: 'Choose File' }).click()
  await expect(page.getByRole('alert')).toContainText('Multiple selected disk Files map to File Path: /wiki/same')
  await expect(page.getByRole('dialog', { name: 'Import Files' })).toBeHidden()
  expect(importRequests).toBe(0)
})
