import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import { markdown, user } from '../../src/db/schema'
import { expect, test } from './fixture'

async function seedTree(searchFiles = 0) {
  const database = drizzle({ connection: { url: 'file:.playwright/local.db' } })
  try {
    const [owner] = await database.select().from(user).where(eq(user.username, 'admin'))
    await database.insert(markdown).values([
      { path: '/memo/inbox/entry', content: 'inbox-only-marker' },
      { path: '/memo/inbox/archive/older', content: 'archive-only-marker' },
      { path: '/deep-only/level-two/leaf', content: 'deep-only-marker' },
      ...Array.from({ length: searchFiles }, (_, index) => ({ path: `/batch/find-${String(index).padStart(3, '0')}`, content: 'paged-matches' })),
    ].map(file => ({
      ...file,
      source: 30,
      title: file.path.split('/').at(-1)!,
      userId: owner.id,
      renderer: 'markdown' as const,
      sourceHash: 'a'.repeat(64),
      private: true,
    })))
  }
  finally {
    database.$client.close()
  }
}

test('editor bootstrap includes only root Files and direct Prefixes', async ({ request }) => {
  await seedTree()
  const response = await request.get('/dashboard/edit')
  expect(response.ok()).toBe(true)
  const html = await response.text()
  expect(html).toContain('First line')
  expect(html).toContain('Second file')
  for (const marker of ['secret memo body', 'hello post body', 'Read-only Source', 'inbox-only-marker', 'archive-only-marker', '/deep-only/level-two/'])
    expect(html.includes(marker), `bootstrap must exclude ${marker}`).toBe(false)
})

test('folder expansion fetches one level, remains lazy after collapse and supports a deep-only branch', async ({ page }) => {
  await seedTree()
  const prefixes: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/_actions/db.editor.prefix'))
      prefixes.push(request.postDataJSON().prefix)
  })
  await page.goto('/dashboard/edit')
  await page.waitForLoadState('networkidle')
  expect(prefixes).toEqual([])
  await expect(page.getByRole('button', { name: 'inbox', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'level-two', exact: true })).toHaveCount(0)

  const memoResponse = page.waitForResponse(response => response.url().includes('/_actions/db.editor.prefix'))
  await page.getByRole('button', { name: 'memo', exact: true }).click()
  const memoBody = await (await memoResponse).text()
  expect(memoBody.includes('secret memo body')).toBe(true)
  expect(memoBody.includes('inbox-only-marker')).toBe(false)
  await expect(page.getByRole('button', { name: 'inbox', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'archive', exact: true })).toHaveCount(0)

  const inboxResponse = page.waitForResponse(response => response.url().includes('/_actions/db.editor.prefix'))
  await page.getByRole('button', { name: 'inbox', exact: true }).click()
  const inboxBody = await (await inboxResponse).text()
  expect(inboxBody.includes('inbox-only-marker')).toBe(true)
  expect(inboxBody.includes('archive-only-marker')).toBe(false)
  await expect(page.getByRole('button', { name: 'entry', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'entry', exact: true }).click()
  const source = page.getByRole('textbox', { name: 'File Source for /memo/inbox/entry' })
  await source.fill('unsaved nested Source')

  await page.getByRole('button', { name: 'memo', exact: true }).click()
  expect(prefixes).toEqual(['/memo/', '/memo/inbox/'])
  await page.getByRole('button', { name: 'memo', exact: true }).click()
  await expect(source).toContainText('unsaved nested Source')
  await expect(page.getByRole('button', { name: 'entry', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'archive', exact: true }).click()
  await expect(page.getByRole('button', { name: 'older', exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'deep-only', exact: true }).click()
  await expect(page.getByRole('button', { name: 'level-two', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'leaf', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'level-two', exact: true }).click()
  await expect(page.getByRole('button', { name: 'leaf', exact: true })).toBeVisible()
})

test('an explicit nested File loads only that File and root data, with no automatic tree requests', async ({ page }) => {
  await seedTree()
  const requests: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/_actions/db.editor.'))
      requests.push(request.url())
  })
  const response = await page.goto('/dashboard/edit?path=/memo/inbox/entry')
  const html = await response!.text()
  expect(html.includes('inbox-only-marker')).toBe(true)
  expect(html.includes('archive-only-marker')).toBe(false)
  expect(html.includes('secret memo body')).toBe(false)
  await page.waitForLoadState('networkidle')
  expect(requests).toEqual([])
  await expect(page.getByRole('textbox', { name: 'File Source for /memo/inbox/entry' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'memo', exact: true })).toHaveAttribute('aria-expanded', 'false')
})

test('unopened nested buffers survive a root reload and reconcile after expansion', async ({ page }) => {
  await seedTree()
  await page.goto('/dashboard/edit?path=/memo/inbox/entry')
  await page.waitForLoadState('networkidle')
  await page.getByRole('textbox', { name: 'File Source for /memo/inbox/entry' }).fill('draft that must survive')
  await expect.poll(() => page.evaluate(() => localStorage.getItem('koala-editor-edit-buffers'))).toContain('draft that must survive')
  await page.goto('/dashboard/edit')
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: 'memo', exact: true }).click()
  await page.getByRole('button', { name: 'inbox', exact: true }).click()
  await page.getByRole('button', { name: 'entry', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'File Source for /memo/inbox/entry' })).toContainText('draft that must survive')
})

test('failed folder loads offer a retry without loading unrelated branches', async ({ page }) => {
  await seedTree()
  await page.goto('/dashboard/edit')
  await page.waitForLoadState('networkidle')
  await page.route('**/_actions/db.editor.prefix/**', route => route.fulfill({
    status: 500,
    contentType: 'application/json',
    body: JSON.stringify({ type: 'AstroActionError', code: 'INTERNAL_SERVER_ERROR', message: 'Temporary failure' }),
  }), { times: 1 })
  await page.getByRole('button', { name: 'memo', exact: true }).click()
  const retry = page.getByRole('button', { name: 'Could not load memo. Retry' })
  await expect(retry).toBeVisible()
  await retry.click()
  await expect(page.getByRole('button', { name: 'inbox', exact: true })).toBeVisible()
  await expect(retry).toBeHidden()
  await expect(page.getByRole('button', { name: 'level-two', exact: true })).toHaveCount(0)
})

test('server search reaches unloaded Files across all pages and opens a result without expanding the tree', async ({ page }) => {
  await seedTree(103)
  await page.goto('/dashboard/edit')
  await page.waitForLoadState('networkidle')
  await page.keyboard.press('Meta+k')
  const finder = page.getByRole('combobox', { name: 'Find a File' })
  await finder.fill('paged-matches')
  await expect(page.getByRole('option')).toHaveCount(50)
  await page.getByRole('button', { name: 'Load more matches' }).click()
  await expect(page.getByRole('option')).toHaveCount(100)
  await page.getByRole('button', { name: 'Load more matches' }).click()
  await expect(page.getByRole('option')).toHaveCount(103)
  await expect(page.getByRole('button', { name: 'Load more matches' })).toBeHidden()
  await page.getByRole('option', { name: /find-102/ }).click()
  await expect(page.getByRole('textbox', { name: 'File Source for /batch/find-102' })).toBeFocused()
  await expect(page.getByRole('button', { name: 'batch', exact: true })).toHaveAttribute('aria-expanded', 'false')
})

test('late search responses cannot replace results for the current keyword', async ({ page }) => {
  await seedTree()
  await page.goto('/dashboard/edit')
  await page.waitForLoadState('networkidle')
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let requested!: () => void
  const pending = new Promise<void>((resolve) => {
    requested = resolve
  })
  await page.route('**/_actions/db.editor.search/**', async (route) => {
    const response = await route.fetch()
    if (route.request().postDataJSON().query === 'inbox-only-marker') {
      requested()
      await gate
    }
    await route.fulfill({ response })
  })
  await page.keyboard.press('Meta+k')
  const finder = page.getByRole('combobox', { name: 'Find a File' })
  await finder.fill('inbox-only-marker')
  await pending
  await finder.fill('secret memo body')
  await expect(page.getByRole('option', { name: /secret/ })).toBeVisible()
  const staleResponse = page.waitForResponse(response => response.url().includes('/_actions/db.editor.search') && response.request().postDataJSON().query === 'inbox-only-marker')
  release()
  await staleResponse
  await expect(page.getByRole('option')).toHaveCount(1)
  await expect(page.getByRole('option', { name: /secret/ })).toBeVisible()
})

test('an unopened File Reference supports on-demand Peek and keyboard navigation', async ({ page }) => {
  await seedTree()
  await page.goto('/dashboard/edit?path=/phase-two')
  await page.waitForLoadState('networkidle')
  await page.getByRole('textbox', { name: 'File Source for /phase-two' }).fill('Open [[/memo/inbox/entry]]')
  await page.getByRole('button', { name: 'preview', exact: true }).click()
  const reference = page.locator('#preview-md a[data-file-reference]', { hasText: '/memo/inbox/entry' })
  await expect(reference).toHaveAttribute('href', '/memo/inbox/entry')
  await reference.focus()
  const peek = page.getByRole('tooltip', { name: 'Peek /memo/inbox/entry' })
  await expect(peek).toContainText('inbox-only-marker')
  await expect(reference).toBeFocused()
  await reference.press('Enter')
  await expect(page.getByRole('textbox', { name: 'File Source for /memo/inbox/entry' })).toContainText('inbox-only-marker')
  await expect(page.getByRole('button', { name: 'memo', exact: true })).toHaveAttribute('aria-expanded', 'false')
})
