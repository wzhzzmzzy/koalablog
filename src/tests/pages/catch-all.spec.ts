import { randomUUID } from 'node:crypto'
import { unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { saveFile } from '@/db/markdown'
import CatchAllPage from '@/pages/[...slug].astro'
import { createClient } from '@libsql/client'
import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const env = {} as Env

const locals = {
  runtime: { env: {} },
  session: { role: '' },
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
        content text,
        tags text,
        incoming_links text,
        outgoing_links text,
        private integer DEFAULT false NOT NULL,
        remoteTruth integer DEFAULT false NOT NULL,
        revision integer DEFAULT 1 NOT NULL,
        createdAt integer DEFAULT (unixepoch()) NOT NULL,
        updatedAt integer DEFAULT (unixepoch()) NOT NULL,
        deletedAt integer
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
})
