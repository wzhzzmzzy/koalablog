import { randomUUID } from 'node:crypto'
import { unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MarkdownSource } from '@/db'
import { add, batchTrashByLinks, emptyTrash, purge, readAnyById, readTrash, restore, trash } from '@/db/markdown'
import { createClient } from '@libsql/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('document recycle bin', () => {
  const testEnv = {} as Env
  let databasePath: string

  beforeEach(async () => {
    databasePath = join(tmpdir(), `koalablog-recycle-bin-${randomUUID()}.db`)
    vi.stubEnv('SQLITE_URL', `file:${databasePath}`)

    const client = createClient({ url: `file:${databasePath}` })
    await client.executeMultiple(`
      CREATE TABLE markdown (
        id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        source integer NOT NULL,
        link text NOT NULL,
        subject text NOT NULL,
        content text,
        tags text,
        incoming_links text,
        outgoing_links text,
        private integer DEFAULT false NOT NULL,
        remoteTruth integer DEFAULT false NOT NULL,
        createdAt integer DEFAULT (unixepoch()) NOT NULL,
        updatedAt integer DEFAULT (unixepoch()) NOT NULL,
        deletedAt integer
      );
      CREATE UNIQUE INDEX markdown_active_link_unique ON markdown (link) WHERE deletedAt IS NULL;
      CREATE UNIQUE INDEX markdown_active_subject_unique ON markdown (subject) WHERE deletedAt IS NULL;
    `)
    client.close()
  })

  afterEach(async () => {
    vi.unstubAllEnvs()
    await unlink(databasePath).catch(() => undefined)
  })

  it('moves a document to the recycle bin without changing its identity', async () => {
    const [document] = await add(testEnv, MarkdownSource.Post, 'Hello', 'content', 'post/hello')

    const result = await trash(testEnv, document.id)
    const trashed = await readAnyById(testEnv, document.id)

    expect(result.status).toBe('trashed')
    expect(trashed).toMatchObject({
      id: document.id,
      link: 'post/hello',
      subject: 'Hello',
    })
    expect(trashed?.deletedAt).toBeInstanceOf(Date)
  })

  it('keeps repeated deletions of the same document identity as separate entries', async () => {
    const [first] = await add(testEnv, MarkdownSource.Post, 'Hello', 'first', 'post/hello')
    await trash(testEnv, first.id)
    const [second] = await add(testEnv, MarkdownSource.Post, 'Hello', 'second', 'post/hello')
    await trash(testEnv, second.id)

    const entries = await readTrash(testEnv)

    expect(entries.map(entry => entry.id).sort()).toEqual([first.id, second.id].sort())
    expect(entries.every(entry => entry.link === 'post/hello' && entry.subject === 'Hello')).toBe(true)
  })

  it('reports a safe rename when the original identity is occupied', async () => {
    const [trashed] = await add(testEnv, MarkdownSource.Post, 'Hello', 'old', 'post/hello')
    await trash(testEnv, trashed.id)
    await add(testEnv, MarkdownSource.Post, 'Hello', 'new', 'post/hello')

    const result = await restore(testEnv, trashed.id)

    expect(result).toEqual({
      status: 'conflict',
      suggestedLink: 'post/hello-restored',
      suggestedSubject: 'Hello (restored)',
    })
    expect((await readAnyById(testEnv, trashed.id))?.deletedAt).toBeInstanceOf(Date)
  })

  it('restores with the next available identity when rename is accepted', async () => {
    const [trashed] = await add(testEnv, MarkdownSource.Post, 'Hello', 'old', 'post/hello')
    await trash(testEnv, trashed.id)
    await add(testEnv, MarkdownSource.Post, 'Hello', 'new', 'post/hello')
    await add(testEnv, MarkdownSource.Post, 'Hello (restored)', 'occupied', 'post/hello-restored')

    const result = await restore(testEnv, trashed.id, true)

    expect(result).toMatchObject({
      status: 'restored',
      document: {
        id: trashed.id,
        link: 'post/hello-restored-2',
        subject: 'Hello (restored 2)',
        deletedAt: null,
      },
    })
  })

  it('permanently deletes only documents that are already in the recycle bin', async () => {
    const [document] = await add(testEnv, MarkdownSource.Post, 'Hello', 'content', 'post/hello')

    expect(await purge(testEnv, document.id)).toEqual({ status: 'not_found' })
    expect(await readAnyById(testEnv, document.id)).toBeDefined()

    await trash(testEnv, document.id)
    expect(await purge(testEnv, document.id)).toEqual({ status: 'purged' })
    expect(await readAnyById(testEnv, document.id)).toBeUndefined()
  })

  it('empties the recycle bin without deleting active documents', async () => {
    const [active] = await add(testEnv, MarkdownSource.Post, 'Active', 'active', 'post/active')
    const [first] = await add(testEnv, MarkdownSource.Post, 'First', 'first', 'post/first')
    const [second] = await add(testEnv, MarkdownSource.Post, 'Second', 'second', 'post/second')
    await trash(testEnv, first.id)
    await trash(testEnv, second.id)

    expect(await emptyTrash(testEnv)).toEqual({ status: 'purged', count: 2 })
    expect(await readTrash(testEnv)).toEqual([])
    expect(await readAnyById(testEnv, active.id)).toBeDefined()
  })

  it('reports duplicate batch links once without inflating the changed count', async () => {
    const [document] = await add(testEnv, MarkdownSource.Wiki, 'Wiki', 'content', 'wiki/a')

    const results = await batchTrashByLinks(testEnv, ['wiki/a', 'wiki/a', 'wiki/missing'])

    expect(results.map(result => result.status)).toEqual(['trashed', 'not_found', 'not_found'])
    expect(results.filter(result => result.status === 'trashed')).toHaveLength(1)
    expect((await readAnyById(testEnv, document.id))?.deletedAt).toBeInstanceOf(Date)
  })
})
