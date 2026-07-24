import { randomUUID } from 'node:crypto'
import { unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MarkdownSource } from '@/db'
import { batchAdd, readList } from '@/db/markdown'
import { createClient } from '@libsql/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const env = {} as Env

function useReadListDatabase() {
  let databasePath: string

  beforeEach(async () => {
    databasePath = join(tmpdir(), `koalablog-read-list-${randomUUID()}.db`)
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

describe('readList filters', () => {
  useReadListDatabase()

  it('filters by Source, tag, visibility, and creation year', async () => {
    await batchAdd(env, [
      { path: '/post/a', content: '', createdAt: new Date('2025-03-01T00:00:00.000Z') },
      { path: '/post/b', content: '#tagx', createdAt: new Date('2026-05-01T00:00:00.000Z') },
      { path: '/post/c', content: '', private: true, createdAt: new Date('2026-06-01T00:00:00.000Z') },
      { path: '/memo/d', content: '', createdAt: new Date('2026-07-01T00:00:00.000Z') },
    ])

    expect((await readList(env, MarkdownSource.Post)).map(file => file.path))
      .toEqual(['/post/b', '/post/a'])
    expect((await readList(env, MarkdownSource.Post, 'tagx')).map(file => file.path))
      .toEqual(['/post/b'])
    expect((await readList(env, MarkdownSource.Post, undefined, { includePrivate: true })).map(file => file.path))
      .toEqual(['/post/c', '/post/b', '/post/a'])
    expect((await readList(env, MarkdownSource.Post, undefined, { year: 2025 })).map(file => file.path))
      .toEqual(['/post/a'])
    expect((await readList(env, MarkdownSource.Post, undefined, { year: 2026, includePrivate: true })).map(file => file.path))
      .toEqual(['/post/c', '/post/b'])
    expect((await readList(env, MarkdownSource.Memo, undefined, { year: 2026 })).map(file => file.path))
      .toEqual(['/memo/d'])
  })
})
