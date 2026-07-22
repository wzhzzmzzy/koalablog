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
  `)
  client.close()
})

afterEach(async () => {
  vi.unstubAllEnvs()
  await unlink(databasePath).catch(() => undefined)
})

describe('file Prefix refresh', () => {
  it('returns only Files directly under the Prefix', async () => {
    await add(env, { path: '/root', renderer: 'markdown', content: 'root' })
    await add(env, { path: '/project/inside', renderer: 'markdown', content: 'inside' })
    await add(env, { path: '/project/nested/deep', renderer: 'markdown', content: 'deep' })
    await add(env, { path: '/project/nested/deeper/hidden', renderer: 'markdown', content: 'hidden' })

    const rootFiles = await readByPrefix(env, '/')
    const projectFiles = await readByPrefix(env, '/project/')

    expect(rootFiles.map(file => file.path).sort()).toEqual([
      '/root',
    ])
    expect(projectFiles.map(file => file.path).sort()).toEqual([
      '/project/inside',
    ])
  })

  it('matches an absolute Prefix at a complete Path-segment boundary', async () => {
    await add(env, { path: '/project/inside', renderer: 'markdown', content: 'inside' })
    await add(env, { path: '/projected/outside', renderer: 'markdown', content: 'outside' })

    const files = await readByPrefix(env, '/project/')

    expect(files.map(file => file.path)).toEqual(['/project/inside'])
  })

  it('treats SQL wildcard characters in a Prefix as literal Path characters', async () => {
    await add(env, { path: '/project_/inside', renderer: 'markdown', content: 'underscore' })
    await add(env, { path: '/projectX/other', renderer: 'markdown', content: 'outside' })
    await add(env, { path: '/100%/inside', renderer: 'markdown', content: 'percent' })
    await add(env, { path: '/100x/other', renderer: 'markdown', content: 'outside' })

    const underscore = await readByPrefix(env, '/project_/')
    const percent = await readByPrefix(env, '/100%/')

    expect(underscore.map(file => file.path)).toEqual(['/project_/inside'])
    expect(percent.map(file => file.path)).toEqual(['/100%/inside'])
  })

  it('matches a Unicode Prefix by code point rather than UTF-16 length', async () => {
    await add(env, { path: '/😀/inside', renderer: 'markdown', content: 'emoji' })

    const files = await readByPrefix(env, '/😀/')

    expect(files.map(file => file.path)).toEqual(['/😀/inside'])
  })
})
