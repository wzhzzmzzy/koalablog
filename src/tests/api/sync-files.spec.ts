import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DELETE, GET, PUT } from '@/pages/api/sync/files/[id]'
import { POST } from '@/pages/api/sync/files/index'

const mocks = vi.hoisted(() => ({
  authInterceptor: vi.fn(async (ctx: any) => {
    ctx.locals.session = ctx.request.headers.get('Authorization') === 'Bearer owner-token'
      ? { userId: 7, role: 'member' }
      : { userId: null, role: '' }
  }),
  readActiveByIdForOwner: vi.fn(),
  saveSyncedFile: vi.fn(),
  trashByIdForOwner: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ authInterceptor: mocks.authInterceptor }))
vi.mock('@/db/markdown', () => ({
  FileInputError: class FileInputError extends Error {},
  readActiveByIdForOwner: mocks.readActiveByIdForOwner,
  saveSyncedFile: mocks.saveSyncedFile,
  trashByIdForOwner: mocks.trashByIdForOwner,
}))

function context(request: Request, id = '3') {
  return {
    request,
    params: { id },
    locals: { runtime: { env: { DB: 'db' } }, session: { userId: null, role: '' } },
  } as any
}

const current = {
  id: 3,
  path: '/memo/owned',
  title: 'owned',
  renderer: 'markdown' as const,
  content: 'server source',
  sourceHash: 'a'.repeat(64),
  private: false,
  revision: 4,
  updatedAt: new Date('2026-07-29T00:00:00.000Z'),
}

beforeEach(() => vi.clearAllMocks())

describe('sync File API', () => {
  it('requires Bearer authentication rather than a cookie session', async () => {
    const response = await POST(context(new Request('https://koala.test/api/sync/files', {
      method: 'POST',
      body: JSON.stringify({ path: '/memo/new', renderer: 'markdown', content: 'new' }),
    })))
    expect(response.status).toBe(401)
    expect(mocks.saveSyncedFile).not.toHaveBeenCalled()
  })

  it('creates a private File for the Bearer Token Owner without accepting Visibility', async () => {
    mocks.saveSyncedFile.mockResolvedValue({ status: 'saved', file: { ...current, path: '/notes/new', private: true, revision: 1 } })
    const response = await POST(context(new Request('https://koala.test/api/sync/files', {
      method: 'POST',
      headers: { Authorization: 'Bearer owner-token' },
      body: JSON.stringify({ path: '/notes/new', renderer: 'markdown', content: 'new' }),
    })))
    expect(response.status).toBe(201)
    expect(mocks.saveSyncedFile).toHaveBeenCalledWith({ DB: 'db' }, {
      id: 0,
      path: '/notes/new',
      renderer: 'markdown',
      content: 'new',
      private: true,
      baseRevision: 0,
      userId: 7,
    })
  })

  it('reads and updates only a File owned by the Bearer Token Owner', async () => {
    mocks.readActiveByIdForOwner.mockResolvedValue(current)
    const get = await GET(context(new Request('https://koala.test/api/sync/files/3', { headers: { Authorization: 'Bearer owner-token' } })))
    expect(get.status).toBe(200)
    expect(await get.json()).toMatchObject({ file: { id: 3, content: 'server source' } })
    expect(mocks.readActiveByIdForOwner).toHaveBeenCalledWith({ DB: 'db' }, 3, 7)

    mocks.saveSyncedFile.mockResolvedValue({ status: 'saved', file: { ...current, content: 'local source', revision: 5 } })
    const put = await PUT(context(new Request('https://koala.test/api/sync/files/3', {
      method: 'PUT',
      headers: { Authorization: 'Bearer owner-token' },
      body: JSON.stringify({ path: '/memo/renamed', renderer: 'markdown', content: 'local source', baseRevision: 4 }),
    })))
    expect(put.status).toBe(200)
    expect(mocks.saveSyncedFile).toHaveBeenCalledWith({ DB: 'db' }, {
      id: 3,
      path: '/memo/renamed',
      renderer: 'markdown',
      content: 'local source',
      private: false,
      baseRevision: 4,
      userId: 7,
    })
  })

  it('does not expose or trash another Owner File', async () => {
    mocks.readActiveByIdForOwner.mockResolvedValue(undefined)
    const get = await GET(context(new Request('https://koala.test/api/sync/files/3', { headers: { Authorization: 'Bearer owner-token' } })))
    expect(get.status).toBe(404)

    mocks.trashByIdForOwner.mockResolvedValue({ status: 'not_found' })
    const remove = await DELETE(context(new Request('https://koala.test/api/sync/files/3', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer owner-token' },
      body: JSON.stringify({ baseRevision: 4 }),
    })))
    expect(remove.status).toBe(404)
    expect(mocks.trashByIdForOwner).toHaveBeenCalledWith({ DB: 'db' }, 3, 7, 4)
  })
})
