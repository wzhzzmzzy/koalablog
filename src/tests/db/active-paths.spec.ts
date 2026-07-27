import { randomUUID } from 'node:crypto'
import { unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createClient } from '@libsql/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { batchAdd, readActivePaths } from '@/db/markdown'

const env = {} as Env

function useActivePathsDatabase() {
  let databasePath: string

  beforeEach(async () => {
    databasePath = join(tmpdir(), `koalablog-active-paths-${randomUUID()}.db`)
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

describe('readActivePaths visibility', () => {
  useActivePathsDatabase()

  it('exposes public paths to anonymous readers and private paths only to their Owner', async () => {
    await batchAdd(env, [
      { path: '/post/public-a', renderer: 'markdown', content: '', userId: 1 },
      { path: '/post/private-a', renderer: 'markdown', content: '', private: true, userId: 1 },
      { path: '/post/private-b', renderer: 'markdown', content: '', private: true, userId: 2 },
    ])

    const client = createClient({ url: process.env.SQLITE_URL! })
    await client.execute(`UPDATE markdown SET deletedAt = unixepoch() WHERE path = '/post/private-b'`)
    client.close()

    await expect(readActivePaths(env)).resolves.toEqual(['/post/public-a'])
    await expect(readActivePaths(env, 2)).resolves.toEqual(['/post/public-a'])

    const ownerPaths = await readActivePaths(env, 1)
    expect(ownerPaths).toContain('/post/public-a')
    expect(ownerPaths).toContain('/post/private-a')
    expect(ownerPaths).not.toContain('/post/private-b')
  })
})
