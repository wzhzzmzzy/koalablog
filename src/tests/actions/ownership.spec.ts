import { randomUUID } from 'node:crypto'
import { unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { createClient } from '@libsql/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { byPrefix, emptyTrash, trash } from '@/actions/db/markdown'
import { save, setPrivate } from '@/actions/form/markdown'
import { add, saveFile, trash as trashFile } from '@/db/markdown'

vi.mock('@/lib/auth', () => ({
  authInterceptor: async (ctx: any) => {
    const userId = Number(ctx.request.headers.get('X-Test-User')) || null
    ctx.locals.session = { userId, role: userId ? 'member' : '' }
  },
}))

const env = {} as Env

function useOwnershipDatabase() {
  let databasePath: string

  beforeEach(async () => {
    databasePath = join(tmpdir(), `koalablog-ownership-${randomUUID()}.db`)
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
}

function createContext(userId?: number) {
  return {
    request: new Request('https://koala.test/action', {
      headers: userId ? { 'X-Test-User': String(userId) } : {},
    }),
    locals: {
      runtime: { env: {} },
      session: { userId: null, role: '' },
    },
  } as any
}

function saveForm(file: { id: number, path: string }, content: string, baseRevision: number) {
  const form = new FormData()
  form.set('id', String(file.id))
  form.set('path', file.path)
  form.set('renderer', 'markdown')
  form.set('content', content)
  form.set('private', 'false')
  form.set('baseRevision', String(baseRevision))
  return form
}

function privateForm(file: { id: number }, baseRevision: number) {
  const form = new FormData()
  form.set('id', String(file.id))
  form.set('private', 'true')
  form.set('baseRevision', String(baseRevision))
  return form
}

async function createOwnedFile(userId: number, path = '/memo/owned') {
  const created = await saveFile(env, {
    id: 0,
    path,
    renderer: 'markdown',
    content: 'owned body',
    private: false,
    baseRevision: 0,
    userId,
  })
  if (created.status !== 'saved')
    throw new Error('Expected fixture File creation to succeed')
  return created.file
}

describe('file mutation ownership', () => {
  useOwnershipDatabase()

  it('lets only the Owner save an existing File', async () => {
    const file = await createOwnedFile(7)

    await expect(save.orThrow.call(createContext(), saveForm(file, 'anonymous edit', file.revision)))
      .rejects
      .toMatchObject({ code: 'UNAUTHORIZED' })

    await expect(save.orThrow.call(createContext(8), saveForm(file, 'hijack', file.revision)))
      .rejects
      .toMatchObject({ code: 'NOT_FOUND' })

    await expect(save.orThrow.call(createContext(7), saveForm(file, 'owner edit', file.revision)))
      .resolves
      .toMatchObject({ content: 'owner edit', userId: 7, private: false })
  })

  it('lets only the Owner trash, restore, and toggle visibility', async () => {
    const file = await createOwnedFile(7, '/memo/guarded')

    await expect(trash.orThrow.call(createContext(8), { id: file.id })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(setPrivate.orThrow.call(createContext(8), privateForm(file, file.revision)))
      .rejects
      .toMatchObject({ code: 'NOT_FOUND' })

    await expect(setPrivate.orThrow.call(createContext(7), privateForm(file, file.revision)))
      .resolves
      .toMatchObject({ private: true })
    await expect(trash.orThrow.call(createContext(7), { id: file.id })).resolves.toMatchObject({ status: 'trashed' })
  })

  it('empties only the current User\'s recycle bin', async () => {
    const own = await createOwnedFile(7, '/memo/own-trash')
    const foreign = await createOwnedFile(8, '/memo/foreign-trash')
    await trashFile(env, own.id)
    await trashFile(env, foreign.id)

    await expect(emptyTrash.orThrow.call(createContext(7), {})).resolves.toMatchObject({ count: 1 })
    const remaining = await emptyTrash.orThrow.call(createContext(8), {})
    expect(remaining).toMatchObject({ count: 1 })
  })
})

describe('file Prefix read scopes', () => {
  useOwnershipDatabase()

  it('keeps the default scope authenticated and Owner-only, including owned public Files', async () => {
    const owned = await createOwnedFile(7, '/data/owned')
    await createOwnedFile(8, '/data/foreign-public')
    await expect(byPrefix.orThrow.call(createContext(), { prefix: '/data' }))
      .rejects
      .toMatchObject({ code: 'UNAUTHORIZED' })
    const files = await byPrefix.orThrow.call(createContext(7), { prefix: '/data' })
    expect(files.map(file => file.id)).toEqual([owned.id])
    expect(files[0]).toMatchObject({ private: false, userId: 7 })
  })

  it('returns only active direct public Files, regardless of the visiting user', async () => {
    const publicFile = await createOwnedFile(7, '/data/public')
    await add(env, { path: '/data/private', renderer: 'markdown', content: 'secret', private: true, userId: 7 })
    await add(env, { path: '/data/deleted', renderer: 'markdown', content: 'deleted secret', deletedAt: new Date(), userId: 7 })
    await createOwnedFile(7, '/database/outside')
    await createOwnedFile(7, '/data/nested/inside')
    for (const userId of [undefined, 7, 8]) {
      const files = await byPrefix.orThrow.call(createContext(userId), { prefix: '/data', scope: 'public' })
      expect(files).toHaveLength(1)
      expect(files[0]).toMatchObject({ id: publicFile.id, content: 'owned body', private: false, canEdit: userId === 7 })
    }
  })

  it('does not expose incoming links from private Files or the Owner id in public responses', async () => {
    const file = await createOwnedFile(7, '/data/public')
    const client = createClient({ url: process.env.SQLITE_URL! })
    await client.execute({ sql: 'UPDATE markdown SET incoming_links = ? WHERE id = ?', args: ['["/private/secret"]', file.id] })
    client.close()
    const files = await byPrefix.orThrow.call(createContext(), { prefix: '/data', scope: 'public' })
    expect(files[0]).toMatchObject({ incoming_links: null, userId: null, canEdit: false })
    expect(JSON.stringify(files)).not.toContain('/private/secret')
  })

  it('rejects unknown scopes instead of falling back to an unscoped database read', async () => {
    await expect(byPrefix.orThrow.call(createContext(), { prefix: '/data', scope: 'all' } as any))
      .rejects
      .toMatchObject({ code: 'BAD_REQUEST' })
  })
})
