import { randomUUID } from 'node:crypto'
import { unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createClient } from '@libsql/client'
import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { add, saveFile } from '@/db/markdown'
import CatchAllPage from '@/pages/[...slug].astro'

const env = {} as Env

const locals = {
  runtime: { env: {} },
  session: { userId: null, role: '' },
  config: { pageConfig: {}, auth: {}, oss: {}, _runtime: { ready: true } },
} as unknown as App.Locals

function useCatchAllDatabase() {
  let databasePath: string

  beforeEach(async () => {
    databasePath = join(tmpdir(), `koalablog-catch-all-${randomUUID()}.db`)
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
        sourceHash text,
        tags text,
        incoming_links text,
        outgoing_links text,
        private integer DEFAULT false NOT NULL,
        remoteTruth integer DEFAULT false NOT NULL,
        revision integer DEFAULT 1 NOT NULL,
        createdAt integer DEFAULT (unixepoch()) NOT NULL,
        updatedAt integer DEFAULT (unixepoch()) NOT NULL,
        deletedAt integer,
        userId integer
      );
      CREATE UNIQUE INDEX markdown_active_path_unique ON markdown (path) WHERE deletedAt IS NULL;
      CREATE INDEX markdown_deleted_at_idx ON markdown (deletedAt);
    `)
    client.close()
  })

  afterEach(async () => {
    vi.unstubAllEnvs()
    await unlink(databasePath).catch(() => undefined)
  })
}

describe('catch-all article route', () => {
  useCatchAllDatabase()

  it('renders a Post through /post/* with its Post Display Title', async () => {
    await saveFile(env, {
      id: 0,
      path: '/post/hello',
      renderer: 'markdown',
      content: '---\ntitle: Custom Headline\n---\n\npost body\n',
      private: false,
      baseRevision: 0,
    })

    const container = await AstroContainer.create()
    const html = await container.renderToString(CatchAllPage, {
      params: { slug: 'post/hello' },
      locals,
      request: new Request('https://koala.test/post/hello'),
    })

    expect(html).toContain('Custom Headline')
    expect(html).toContain('post body')
  })

  it('renders a legacy /memos/* File at its literal path', async () => {
    await saveFile(env, {
      id: 0,
      path: '/memos/legacy-note',
      renderer: 'markdown',
      content: 'legacy memo body',
      private: false,
      baseRevision: 0,
    })

    const container = await AstroContainer.create()
    const html = await container.renderToString(CatchAllPage, {
      params: { slug: 'memos/legacy-note' },
      locals,
      request: new Request('https://koala.test/memos/legacy-note'),
    })

    expect(html).toContain('legacy memo body')
  })

  it('redirects an anonymous visitor of a private File to login and back', async () => {
    await saveFile(env, {
      id: 0,
      path: '/memo/secret',
      renderer: 'markdown',
      content: 'secret body',
      private: true,
      baseRevision: 0,
      userId: 7,
    })

    const container = await AstroContainer.create()
    const response = await container.renderToResponse(CatchAllPage, {
      params: { slug: 'memo/secret' },
      locals,
      request: new Request('https://koala.test/memo/secret'),
    })

    expect(response.status).toBe(302)
    expect(response.headers.get('Location')).toBe('/login?from=%2Fmemo%2Fsecret')
  })

  it('serves a private File only to its Owner', async () => {
    await saveFile(env, {
      id: 0,
      path: '/memo/secret',
      renderer: 'markdown',
      content: 'secret body',
      private: true,
      baseRevision: 0,
      userId: 7,
    })

    const container = await AstroContainer.create()
    const rendered = await container.renderToString(CatchAllPage, {
      params: { slug: 'memo/secret' },
      locals: { ...locals, session: { userId: 7, role: 'member' } },
      request: new Request('https://koala.test/memo/secret'),
    })
    expect(rendered).toContain('secret body')

    const response = await container.renderToResponse(CatchAllPage, {
      params: { slug: 'memo/secret' },
      locals: { ...locals, session: { userId: 8, role: 'member' } },
      request: new Request('https://koala.test/memo/secret'),
    })
    expect(response.status).toBe(302)
    expect(response.headers.get('Location')).toBe('/404?source=%2Fmemo%2Fsecret')
  })

  it('redirects a missing extensionless File Path to its visible Path Prefix URL', async () => {
    await add(env, { path: '/memos/public-note', renderer: 'markdown', content: '', userId: 1 })

    const container = await AstroContainer.create()
    const response = await container.renderToResponse(CatchAllPage, {
      params: { slug: 'memos' },
      locals,
      request: new Request('https://koala.test/memos'),
    })

    expect(response.status).toBe(302)
    expect(response.headers.get('Location')).toBe('/memos/')
  })

  it('does not expose a Path Prefix that contains only invisible Files', async () => {
    await add(env, { path: '/secret/hidden', renderer: 'markdown', content: '', private: true, userId: 7 })

    const container = await AstroContainer.create()
    const anonymousResponse = await container.renderToResponse(CatchAllPage, {
      params: { slug: 'secret' },
      locals,
      request: new Request('https://koala.test/secret'),
    })
    expect(anonymousResponse.headers.get('Location')).toBe('/404?source=%2Fsecret')

    const ownerResponse = await container.renderToResponse(CatchAllPage, {
      params: { slug: 'secret' },
      locals: { ...locals, session: { userId: 7, role: 'member' } },
      request: new Request('https://koala.test/secret'),
    })
    expect(ownerResponse.headers.get('Location')).toBe('/secret/')
  })

  it('lists only visible direct Files and visible direct child Prefixes', async () => {
    await add(env, { path: '/memos/public-note', renderer: 'markdown', content: '', userId: 1 })
    await add(env, { path: '/memos/private-note', renderer: 'markdown', content: '', private: true, userId: 7 })
    await add(env, { path: '/memos/private-other', renderer: 'markdown', content: '', private: true, userId: 8 })
    await add(env, { path: '/memos/inbox/today', renderer: 'markdown', content: '', userId: 1 })
    await add(env, { path: '/memos/owner-only/secret', renderer: 'markdown', content: '', private: true, userId: 7 })
    await add(env, { path: '/memos/hidden/secret', renderer: 'markdown', content: '', private: true, userId: 8 })
    await add(env, { path: '/memos/trashed', renderer: 'markdown', content: '', deletedAt: new Date(), userId: 1 })

    const container = await AstroContainer.create()
    const anonymousHtml = await container.renderToString(CatchAllPage, {
      params: { slug: 'memos' },
      locals,
      request: new Request('https://koala.test/memos/'),
    })

    expect(anonymousHtml).toContain('href="/"')
    expect(anonymousHtml).toContain('../</a>')
    expect(anonymousHtml).toContain('href="/memos/inbox/"')
    expect(anonymousHtml).toContain('inbox/</a>')
    expect(anonymousHtml).toContain('href="/memos/public-note"')
    expect(anonymousHtml).toContain('public-note</a>')
    expect(anonymousHtml).not.toContain('private-note')
    expect(anonymousHtml).not.toContain('private-other')
    expect(anonymousHtml).not.toContain('owner-only/')
    expect(anonymousHtml).not.toContain('hidden/')
    expect(anonymousHtml).not.toContain('today')
    expect(anonymousHtml).not.toContain('trashed')

    const ownerHtml = await container.renderToString(CatchAllPage, {
      params: { slug: 'memos' },
      locals: { ...locals, session: { userId: 7, role: 'member' } },
      request: new Request('https://koala.test/memos/'),
    })

    expect(ownerHtml).toContain('private-note')
    expect(ownerHtml).toContain('owner-only/')
    expect(ownerHtml).not.toContain('private-other')
    expect(ownerHtml).not.toContain('hidden/')
  })

  it('links a nested Path Prefix to its parent and keeps deeper Files behind child Prefixes', async () => {
    await add(env, { path: '/memos/inbox/note', renderer: 'markdown', content: '', userId: 1 })
    await add(env, { path: '/memos/inbox/archive/old', renderer: 'markdown', content: '', userId: 1 })

    const container = await AstroContainer.create()
    const html = await container.renderToString(CatchAllPage, {
      params: { slug: 'memos/inbox' },
      locals,
      request: new Request('https://koala.test/memos/inbox/'),
    })

    expect(html).toContain('href="/memos/"')
    expect(html).toContain('../</a>')
    expect(html).toContain('href="/memos/inbox/archive/"')
    expect(html).toContain('archive/</a>')
    expect(html).toContain('href="/memos/inbox/note"')
    expect(html).toContain('note</a>')
    expect(html).not.toContain('old')
  })

  it('renders an exact File without a slash and its Path Prefix listing with a slash', async () => {
    await add(env, { path: '/memos', renderer: 'markdown', content: 'exact File body', userId: 1 })
    await add(env, { path: '/memos/child', renderer: 'markdown', content: '', userId: 1 })

    const container = await AstroContainer.create()
    const fileHtml = await container.renderToString(CatchAllPage, {
      params: { slug: 'memos' },
      locals,
      request: new Request('https://koala.test/memos'),
    })
    expect(fileHtml).toContain('exact File body')

    const prefixHtml = await container.renderToString(CatchAllPage, {
      params: { slug: 'memos' },
      locals,
      request: new Request('https://koala.test/memos/'),
    })
    expect(prefixHtml).toContain('Index of')
    expect(prefixHtml).toContain('href="/memos/child"')
    expect(prefixHtml).toContain('child</a>')
    expect(prefixHtml).not.toContain('exact File body')
  })
})
