import { randomUUID } from 'node:crypto'
import { unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createClient } from '@libsql/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { add, readByPrefix, readVisiblePathPrefix } from '@/db/markdown'

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

describe('file Prefix refresh', () => {
  it('returns only Files directly under the Prefix', async () => {
    await add(env, { path: '/root', renderer: 'markdown', content: 'root', userId: 1 })
    await add(env, { path: '/project/inside', renderer: 'markdown', content: 'inside', userId: 1 })
    await add(env, { path: '/project/nested/deep', renderer: 'markdown', content: 'deep', userId: 1 })
    await add(env, { path: '/project/nested/deeper/hidden', renderer: 'markdown', content: 'hidden', userId: 1 })

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
    await add(env, { path: '/project/inside', renderer: 'markdown', content: 'inside', userId: 1 })
    await add(env, { path: '/projected/outside', renderer: 'markdown', content: 'outside', userId: 1 })

    const files = await readByPrefix(env, '/project/')

    expect(files.map(file => file.path)).toEqual(['/project/inside'])
  })

  it('treats SQL wildcard characters in a Prefix as literal Path characters', async () => {
    await add(env, { path: '/project_/inside', renderer: 'markdown', content: 'underscore', userId: 1 })
    await add(env, { path: '/projectX/other', renderer: 'markdown', content: 'outside', userId: 1 })
    await add(env, { path: '/100%/inside', renderer: 'markdown', content: 'percent', userId: 1 })
    await add(env, { path: '/100x/other', renderer: 'markdown', content: 'outside', userId: 1 })

    const underscore = await readByPrefix(env, '/project_/')
    const percent = await readByPrefix(env, '/100%/')

    expect(underscore.map(file => file.path)).toEqual(['/project_/inside'])
    expect(percent.map(file => file.path)).toEqual(['/100%/inside'])
  })

  it('matches a Unicode Prefix by code point rather than UTF-16 length', async () => {
    await add(env, { path: '/😀/inside', renderer: 'markdown', content: 'emoji', userId: 1 })

    const files = await readByPrefix(env, '/😀/')

    expect(files.map(file => file.path)).toEqual(['/😀/inside'])
  })
})

describe('public Path Prefix listing', () => {
  it('returns visible direct Files and derives only visible direct Prefixes', async () => {
    await add(env, { path: '/memos/public', renderer: 'markdown', content: '', userId: 1 })
    await add(env, { path: '/memos/private-owner', renderer: 'markdown', content: '', private: true, userId: 1 })
    await add(env, { path: '/memos/private-other', renderer: 'markdown', content: '', private: true, userId: 2 })
    await add(env, { path: '/memos/inbox/today', renderer: 'markdown', content: '', userId: 2 })
    await add(env, { path: '/memos/inbox/archive/old', renderer: 'markdown', content: '', userId: 2 })
    await add(env, { path: '/memos/owner-only/secret', renderer: 'markdown', content: '', private: true, userId: 1 })
    await add(env, { path: '/memos/hidden/secret', renderer: 'markdown', content: '', private: true, userId: 2 })
    await add(env, { path: '/memos/trashed', renderer: 'markdown', content: '', deletedAt: new Date(), userId: 1 })
    await add(env, { path: '/memos-old/outside', renderer: 'markdown', content: '', userId: 1 })

    const anonymous = await readVisiblePathPrefix(env, '/memos/')
    expect(anonymous.files.map(file => file.path)).toEqual(['/memos/public'])
    expect(anonymous.prefixes).toEqual(['/memos/inbox/'])

    const owner = await readVisiblePathPrefix(env, '/memos/', 1)
    expect(owner.files.map(file => file.path)).toEqual([
      '/memos/private-owner',
      '/memos/public',
    ])
    expect(owner.prefixes).toEqual([
      '/memos/inbox/',
      '/memos/owner-only/',
    ])
  })
})
