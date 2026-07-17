import { randomUUID } from 'node:crypto'
import { unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { add, readByPrefix } from '@/db/markdown'
import { createClient } from '@libsql/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const env = {} as Env
let databasePath: string

beforeEach(async () => {
  databasePath = join(tmpdir(), `koalablog-file-prefix-${randomUUID()}.db`)
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

describe('file Prefix refresh', () => {
  it('matches an absolute Prefix at a complete Path-segment boundary', async () => {
    await add(env, { path: '/project/inside', content: 'inside' })
    await add(env, { path: '/projected/outside', content: 'outside' })

    const files = await readByPrefix(env, '/project/')

    expect(files.map(file => file.path)).toEqual(['/project/inside'])
  })

  it('treats SQL wildcard characters in a Prefix as literal Path characters', async () => {
    await add(env, { path: '/project_/inside', content: 'underscore' })
    await add(env, { path: '/projectX/other', content: 'outside' })
    await add(env, { path: '/100%/inside', content: 'percent' })
    await add(env, { path: '/100x/other', content: 'outside' })

    const underscore = await readByPrefix(env, '/project_/')
    const percent = await readByPrefix(env, '/100%/')

    expect(underscore.map(file => file.path)).toEqual(['/project_/inside'])
    expect(percent.map(file => file.path)).toEqual(['/100%/inside'])
  })
})
