import type { APIContext } from 'astro'
import { randomUUID } from 'node:crypto'
import { unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createClient } from '@libsql/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { batchAdd, trash, updatePrivate } from '@/db/markdown'
import { GET as full } from '@/pages/llms-full.txt'
import { GET as index } from '@/pages/llms.txt'

const env = {} as Env
let databasePath: string

function context(userId?: number): APIContext {
  return {
    url: new URL('https://request.example/llms.txt'),
    locals: {
      runtime: { env },
      config: { pageConfig: { title: 'Test blog' } },
      session: { userId },
    },
  } as APIContext
}

beforeEach(async () => {
  databasePath = join(tmpdir(), `koalablog-llms-${randomUUID()}.db`)
  vi.stubEnv('SQLITE_URL', `file:${databasePath}`)
  const client = createClient({ url: `file:${databasePath}` })
  await client.executeMultiple(`
    CREATE TABLE markdown (
      id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      source integer NOT NULL,
      path text NOT NULL,
      title text NOT NULL,
      renderer text DEFAULT 'markdown' NOT NULL,
      content text NOT NULL,
      sourceHash text NOT NULL,
      tags text,
      incoming_links text,
      outgoing_links text,
      private integer DEFAULT false NOT NULL,
      revision integer DEFAULT 1 NOT NULL,
      createdAt integer DEFAULT (unixepoch()) NOT NULL,
      updatedAt integer DEFAULT (unixepoch()) NOT NULL,
      deletedAt integer,
      userId integer
    );
    CREATE UNIQUE INDEX markdown_active_path_unique ON markdown (path) WHERE deletedAt IS NULL;
  `)
  client.close()
})

afterEach(async () => {
  vi.unstubAllEnvs()
  await unlink(databasePath).catch(() => undefined)
})

describe.each([['index', index], ['full', full]] as const)('llms %s endpoint', (_name, get) => {
  it('includes only public active Files for anonymous readers and signed-in Owners', async () => {
    const files = await batchAdd(env, [
      { path: '/post/public', renderer: 'markdown', content: 'Public body', userId: 1 },
      { path: '/memo/public', renderer: 'markdown', content: 'Public memo', private: false, userId: 2 },
      { path: '/post/owner-secret', renderer: 'markdown', content: 'Owner secret body', private: true, userId: 1 },
      { path: '/post/other-secret', renderer: 'markdown', content: 'Other secret body', private: true, userId: 2 },
      { path: '/post/deleted', renderer: 'markdown', content: 'Deleted body', userId: 1 },
    ])
    await trash(env, files[4].id)

    const response = await get(context())
    const anonymous = await response.text()
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('text/plain; charset=utf-8')
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(anonymous).toContain('https://request.example/post/public')
    expect(anonymous).toContain('https://request.example/memo/public')
    expect(anonymous).not.toMatch(/secret|Deleted body|\/post\/deleted/)
    expect(await (await get(context(1))).text()).toBe(anonymous)

    await updatePrivate(env, files[0].id, true, files[0].revision)
    const afterPrivate = await (await get(context(1))).text()
    expect(afterPrivate).not.toContain('/post/public')
    expect(afterPrivate).not.toContain('Public body')
  })

  it('orders Posts before Memos, then by descending creation time and path', async () => {
    await batchAdd(env, [
      { path: '/memo/newest', renderer: 'markdown', content: '', private: false, createdAt: new Date('2026-09-18') },
      { path: '/post/z', renderer: 'markdown', content: '', createdAt: new Date('2026-09-17') },
      { path: '/post/old', renderer: 'markdown', content: '', createdAt: new Date('2026-09-16') },
      { path: '/post/a', renderer: 'markdown', content: '', createdAt: new Date('2026-09-17') },
      { path: '/memo/old', renderer: 'markdown', content: '', private: false, createdAt: new Date('2026-09-15') },
    ])
    const body = await (await get(context())).text()
    expect(body.match(/https:\/\/request\.example\/[^\s)]+/g)).toEqual([
      'https://request.example/post/a',
      'https://request.example/post/z',
      'https://request.example/post/old',
      'https://request.example/memo/newest',
      'https://request.example/memo/old',
    ])
    expect(body.indexOf('## Posts')).toBeLessThan(body.indexOf('## Memos'))
  })

  it('works with an empty site and independently of the RSS enable switch', async () => {
    const ctx = context()
    ctx.locals.config.pageConfig = {}
    ctx.locals.config.rss = { enable: false, description: 'A public blog' }
    const response = await get(ctx)
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('# Koalablog\n\n> A public blog\n')
  })

  it('uses canonical site settings with Astro site and request origin fallbacks', async () => {
    await batchAdd(env, [{ path: '/post/example', renderer: 'markdown', content: '' }])
    const ctx = context()
    ctx.site = new URL('https://astro.example/')
    expect(await (await get(ctx)).text()).toContain('https://astro.example/post/example')
    ctx.locals.config.rss = { enable: false, site: 'https://canonical.example/' }
    expect(await (await get(ctx)).text()).toContain('https://canonical.example/post/example')
  })
})

it('exports complete Markdown bodies without frontmatter or Svelte Source', async () => {
  const markdown = [
    '# Heading\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n```ts\nconst value = 1\n```\n\n',
    'A complete paragraph.\n\n'.repeat(1000),
    'End of the complete body.\n',
  ].join('')
  await batchAdd(env, [
    { path: '/post/article', renderer: 'markdown', content: `---\ntitle: Display title\n---\n\n${markdown}` },
    { path: '/post/app', renderer: 'svelte', content: '<script>const sourceOnlyMarker = 1</script><h1>App</h1>' },
  ])

  const body = await (await full(context())).text()
  expect(body).toContain('### Display title\n\nSource: https://request.example/post/article')
  expect(body).toContain(markdown)
  expect(body).not.toContain('title: Display title')
  expect(body).toContain('https://request.example/post/app')
  expect(body).toContain('This Svelte page has no Markdown body.')
  expect(body).not.toContain('sourceOnlyMarker')

  const listing = await (await index(context())).text()
  expect(listing).toContain('- [Display title](https://request.example/post/article)')
  expect(listing).toContain('- [app](https://request.example/post/app)')
  expect(listing).not.toContain('A complete paragraph.')
  expect(listing).not.toContain('sourceOnlyMarker')
})

it('escapes display titles and encodes paths without creating URL queries or fragments', async () => {
  await batchAdd(env, [{
    path: '/post/你好 (a)#b?c',
    renderer: 'markdown',
    content: '---\ntitle: "A [title] *here*"\n---\n\nBody',
  }])
  const listing = await (await index(context())).text()
  expect(listing).toContain('- [A \\[title\\] \\*here\\*](https://request.example/post/%E4%BD%A0%E5%A5%BD%20%28a%29%23b%3Fc)')
})
