import type { CreationTemplateV1 } from '@/lib/files/types'
import { randomUUID } from 'node:crypto'
import { unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createFile } from '@/db/file-create'
import { batchAdd } from '@/db/markdown'
import { ensureTemplateCatalogInitialized, replaceTemplateCatalog } from '@/db/template-catalog'
import { createClient } from '@libsql/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const env = {} as Env

function useFileCreationDatabase() {
  let databasePath: string

  beforeEach(async () => {
    databasePath = join(tmpdir(), `koalablog-file-create-${randomUUID()}.db`)
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
        deletedAt integer
      );
      CREATE UNIQUE INDEX markdown_active_path_unique ON markdown (path) WHERE deletedAt IS NULL;
      CREATE TABLE creation_template_catalog (
        key text PRIMARY KEY NOT NULL,
        schemaVersion integer NOT NULL,
        revision integer NOT NULL,
        payload text NOT NULL,
        createdAt integer DEFAULT (unixepoch()) NOT NULL,
        updatedAt integer DEFAULT (unixepoch()) NOT NULL
      );
    `)
    client.close()
  })

  afterEach(async () => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
    await unlink(databasePath).catch(() => undefined)
  })
}

async function storeTemplates(templates: CreationTemplateV1[]) {
  const catalog = await ensureTemplateCatalogInitialized(env)
  const saved = await replaceTemplateCatalog(env, catalog.revision, templates)
  if (saved.status !== 'saved')
    throw new Error('Expected Template fixture replacement to succeed')
}

function fixedTemplate(overrides: Partial<CreationTemplateV1> = {}): CreationTemplateV1 {
  return {
    id: 'fixed',
    prefix: '/post/',
    titlePattern: 'welcome',
    pathPattern: '{{targetPrefix}}/{{title}}',
    content: 'Path: {{path}}',
    ...overrides,
  }
}

describe('server File creation Template resolution', () => {
  useFileCreationDatabase()

  it('instantiates the longest Template under the complete clicked Prefix', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 16, 6, 7))
    await storeTemplates([
      fixedTemplate({ id: 'root', prefix: '/', titlePattern: 'root', content: 'root' }),
      fixedTemplate({ id: 'post', content: 'post {{title}} at {{path}}' }),
    ])

    const result = await createFile(env, { targetPrefix: '/post/project/' })

    expect(result).toMatchObject({
      status: 'created',
      file: {
        id: expect.any(Number),
        path: '/post/project/welcome',
        title: 'welcome',
        content: 'post welcome at /post/project/welcome',
        private: false,
        revision: 1,
      },
    })
  })

  it('applies the ordinary memo Template and Visibility Default', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 16, 6, 7))
    await ensureTemplateCatalogInitialized(env)

    const result = await createFile(env, { targetPrefix: '/memo/project/' })

    expect(result).toMatchObject({
      status: 'created',
      file: { path: '/memo/project/202607160607', title: '202607160607', content: '', private: true },
    })
  })
})

describe('server File creation collision behavior', () => {
  useFileCreationDatabase()

  it('uses database conflicts to advance Blank Creation candidates', async () => {
    await storeTemplates([])

    const [first, second] = await Promise.all([
      createFile(env, { targetPrefix: '/wiki/' }),
      createFile(env, { targetPrefix: '/wiki/' }),
    ])

    expect([first, second].map(result => result.status === 'created' ? result.file.path : result.status).sort())
      .toEqual(['/wiki/unnamed', '/wiki/unnamed-1'])
  })

  it('retries a Template only when Title contains uniqueSuffix', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 16, 6, 7))
    await ensureTemplateCatalogInitialized(env)
    await batchAdd(env, [{ path: '/memo/202607160607', content: 'occupied' }])

    const result = await createFile(env, { targetPrefix: '/memo/' })

    expect(result).toMatchObject({
      status: 'created',
      file: { path: '/memo/202607160607-1', title: '202607160607-1' },
    })
  })

  it('returns path_conflict without renaming a fixed Template result', async () => {
    await storeTemplates([fixedTemplate()])
    await batchAdd(env, [{ path: '/post/welcome', content: 'occupied' }])

    expect(await createFile(env, { targetPrefix: '/post/' })).toEqual({
      status: 'path_conflict',
      path: '/post/welcome',
    })
  })

  it('stops Blank Creation after the shared bounded attempt limit', async () => {
    await storeTemplates([])
    await batchAdd(env, Array.from({ length: 100 }, (_, index) => ({
      path: `/wiki/unnamed${index === 0 ? '' : `-${index}`}`,
      content: 'occupied',
    })))

    expect(await createFile(env, { targetPrefix: '/wiki/' })).toEqual({
      status: 'path_conflict',
      path: '/wiki/unnamed-99',
    })
  })
})

describe('server File creation Catalog state', () => {
  useFileCreationDatabase()

  it('does not synthesize a Template or Blank Creation when the Catalog is absent', async () => {
    expect(await createFile(env, { targetPrefix: '/' })).toEqual({ status: 'catalog_absent' })
  })
})
