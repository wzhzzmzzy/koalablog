import { randomUUID } from 'node:crypto'
import { unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readById, saveFile } from '@/db/markdown'
import { createClient } from '@libsql/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('file Source Save', () => {
  const env = {} as Env
  let databasePath: string

  beforeEach(async () => {
    databasePath = join(tmpdir(), `koalablog-file-save-${randomUUID()}.db`)
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

  it('derives File metadata from absolute Path and Markdown Source', async () => {
    const result = await saveFile(env, {
      id: 0,
      path: '/memo/项目笔记',
      content: '#项目\n\n参见 [[/wiki/术语]]、[[relative]] 和 `#忽略`。',
      private: true,
      baseRevision: 0,
    })

    expect(result).toMatchObject({
      status: 'saved',
      file: {
        source: 30,
        path: '/memo/项目笔记',
        title: '项目笔记',
        tags: '项目',
        outgoing_links: '["/wiki/术语"]',
        private: true,
        remoteTruth: true,
        revision: 1,
      },
    })
    expect(await readById(env, result.status === 'saved' ? result.file.id : 0)).toMatchObject(result.status === 'saved' ? result.file : {})
  })

  it('accepts only one Save for a shared base revision and returns current server values to the loser', async () => {
    const created = await saveFile(env, {
      id: 0,
      path: '/post/concurrency',
      content: 'initial',
      private: false,
      baseRevision: 0,
    })
    if (created.status !== 'saved')
      throw new Error('Expected fixture File creation to succeed')

    const results = await Promise.all([
      saveFile(env, {
        id: created.file.id,
        path: '/post/concurrency',
        content: 'first writer',
        private: false,
        baseRevision: created.file.revision,
      }),
      saveFile(env, {
        id: created.file.id,
        path: '/post/concurrency',
        content: 'second writer',
        private: true,
        baseRevision: created.file.revision,
      }),
    ])

    expect(results.map(result => result.status).sort()).toEqual(['conflict', 'saved'])
    const saved = results.find(result => result.status === 'saved')
    const conflict = results.find(result => result.status === 'conflict')
    expect(saved).toMatchObject({ status: 'saved', file: { revision: 2 } })
    expect(conflict).toMatchObject({
      status: 'conflict',
      current: saved?.status === 'saved' ? saved.file : {},
    })
    expect(await readById(env, created.file.id)).toMatchObject(saved?.status === 'saved' ? saved.file : {})
  })

  it('reports an occupied active Path without mutating either File', async () => {
    const first = await saveFile(env, {
      id: 0,
      path: '/wiki/first',
      content: 'first',
      private: false,
      baseRevision: 0,
    })
    const second = await saveFile(env, {
      id: 0,
      path: '/wiki/second',
      content: 'second',
      private: false,
      baseRevision: 0,
    })
    if (first.status !== 'saved' || second.status !== 'saved')
      throw new Error('Expected File fixtures to be created')

    const result = await saveFile(env, {
      id: first.file.id,
      path: second.file.path,
      content: 'must not overwrite',
      private: true,
      baseRevision: first.file.revision,
    })

    expect(result).toEqual({ status: 'path_conflict', path: '/wiki/second' })
    expect(await readById(env, first.file.id)).toMatchObject(first.file)
    expect(await readById(env, second.file.id)).toMatchObject(second.file)
  })
})
