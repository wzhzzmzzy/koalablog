import { randomUUID } from 'node:crypto'
import { unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createClient } from '@libsql/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyTrash, trash } from '@/actions/db/markdown'
import { save, setPrivate } from '@/actions/form/markdown'
import { saveFile, trash as trashFile } from '@/db/markdown'

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

    await expect(save.orThrow.call(createContext(8), saveForm(file, 'hijack', file.revision)))
      .rejects
      .toMatchObject({ code: 'NOT_FOUND' })

    await expect(save.orThrow.call(createContext(7), saveForm(file, 'owner edit', file.revision)))
      .resolves
      .toMatchObject({ content: 'owner edit', userId: 7 })
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
