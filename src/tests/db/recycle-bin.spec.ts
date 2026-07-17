import { randomUUID } from 'node:crypto'
import { unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { add, batchTrashByPaths, emptyTrash, purge, readAnyById, readTrash, restore, trash } from '@/db/markdown'
import { createClient } from '@libsql/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const testEnv = {} as Env

function useRecycleBinDatabase() {
  let databasePath: string

  beforeEach(async () => {
    databasePath = join(tmpdir(), `koalablog-recycle-bin-${randomUUID()}.db`)
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
    `)
    client.close()
  })

  afterEach(async () => {
    vi.unstubAllEnvs()
    await unlink(databasePath).catch(() => undefined)
  })

  return () => databasePath
}

describe('file recycle bin trash', () => {
  useRecycleBinDatabase()

  it('moves a File to the recycle bin without changing its identity', async () => {
    const [file] = await add(testEnv, { path: '/post/hello', content: 'content' })

    const result = await trash(testEnv, file.id)
    const trashed = await readAnyById(testEnv, file.id)

    expect(result.status).toBe('trashed')
    expect(trashed).toMatchObject({
      id: file.id,
      path: '/post/hello',
      title: 'hello',
    })
    expect(trashed?.deletedAt).toBeInstanceOf(Date)
  })

  it('keeps repeated deletions of the same File identity as separate entries', async () => {
    const [first] = await add(testEnv, { path: '/post/hello', content: 'first' })
    await trash(testEnv, first.id)
    const [second] = await add(testEnv, { path: '/post/hello', content: 'second' })
    await trash(testEnv, second.id)

    const entries = await readTrash(testEnv)

    expect(entries.map(entry => entry.id).sort()).toEqual([first.id, second.id].sort())
    expect(entries.every(entry => entry.path === '/post/hello' && entry.title === 'hello')).toBe(true)
  })
})

describe('file recycle bin restore', () => {
  const databasePath = useRecycleBinDatabase()

  it('reports a safe rename when the original identity is occupied', async () => {
    const [trashed] = await add(testEnv, { path: '/post/hello', content: 'old' })
    await trash(testEnv, trashed.id)
    await add(testEnv, { path: '/post/hello', content: 'new' })

    const result = await restore(testEnv, trashed.id)

    expect(result).toEqual({
      status: 'conflict',
      suggestedPath: '/post/hello-restored',
      suggestedTitle: 'hello-restored',
    })
    expect((await readAnyById(testEnv, trashed.id))?.deletedAt).toBeInstanceOf(Date)
  })

  it('restores with the next available identity when rename is accepted', async () => {
    const [trashed] = await add(testEnv, { path: '/post/hello', content: 'old' })
    await trash(testEnv, trashed.id)
    await add(testEnv, { path: '/post/hello', content: 'new' })
    await add(testEnv, { path: '/post/hello-restored', content: 'occupied' })

    const result = await restore(testEnv, trashed.id, true)

    expect(result).toMatchObject({
      status: 'restored',
      file: {
        id: trashed.id,
        path: '/post/hello-restored-2',
        title: 'hello-restored-2',
        deletedAt: null,
      },
    })
  })

  it('derives Title from Path when restoring without a Path conflict', async () => {
    const client = createClient({ url: `file:${databasePath()}` })
    const inserted = await client.execute({
      sql: `INSERT INTO markdown (source, path, title, content, deletedAt) VALUES (?, ?, ?, ?, ?)`,
      args: [10, '/post/canonical-title', 'stale-title', 'content', Math.floor(Date.now() / 1000)],
    })
    client.close()

    const id = Number(inserted.lastInsertRowid)
    const result = await restore(testEnv, id)

    expect(result).toMatchObject({
      status: 'restored',
      file: {
        id,
        path: '/post/canonical-title',
        title: 'canonical-title',
        deletedAt: null,
      },
    })
  })

  it('keeps a legacy recycled File inactive when its stored Path is invalid', async () => {
    const client = createClient({ url: `file:${databasePath()}` })
    const inserted = await client.execute({
      sql: `INSERT INTO markdown (source, path, title, content, deletedAt) VALUES (?, ?, ?, ?, ?)`,
      args: [30, '/memo/legacy.md', 'legacy.md', 'legacy', Math.floor(Date.now() / 1000)],
    })
    client.close()

    const id = Number(inserted.lastInsertRowid)
    const result = await restore(testEnv, id)

    expect(result).toEqual({ status: 'invalid_path', path: '/memo/legacy.md' })
    expect((await readAnyById(testEnv, id))?.deletedAt).toBeInstanceOf(Date)
  })
})

describe('file recycle bin purge and batch trash', () => {
  useRecycleBinDatabase()

  it('permanently deletes only Files that are already in the recycle bin', async () => {
    const [file] = await add(testEnv, { path: '/post/hello', content: 'content' })

    expect(await purge(testEnv, file.id)).toEqual({ status: 'not_found' })
    expect(await readAnyById(testEnv, file.id)).toBeDefined()

    await trash(testEnv, file.id)
    expect(await purge(testEnv, file.id)).toEqual({ status: 'purged' })
    expect(await readAnyById(testEnv, file.id)).toBeUndefined()
  })

  it('empties the recycle bin without deleting active Files', async () => {
    const [active] = await add(testEnv, { path: '/post/active', content: 'active' })
    const [first] = await add(testEnv, { path: '/post/first', content: 'first' })
    const [second] = await add(testEnv, { path: '/post/second', content: 'second' })
    await trash(testEnv, first.id)
    await trash(testEnv, second.id)

    expect(await emptyTrash(testEnv)).toEqual({ status: 'purged', count: 2 })
    expect(await readTrash(testEnv)).toEqual([])
    expect(await readAnyById(testEnv, active.id)).toBeDefined()
  })

  it('reports duplicate batch Paths once without inflating the changed count', async () => {
    const [file] = await add(testEnv, { path: '/wiki/a', content: 'content' })

    const results = await batchTrashByPaths(testEnv, ['/wiki/a', '/wiki/a', '/wiki/missing'])

    expect(results.map(result => result.status)).toEqual(['trashed', 'not_found', 'not_found'])
    expect(results.filter(result => result.status === 'trashed')).toHaveLength(1)
    expect((await readAnyById(testEnv, file.id))?.deletedAt).toBeInstanceOf(Date)
  })
})
