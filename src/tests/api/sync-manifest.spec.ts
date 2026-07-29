import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from '@/pages/api/sync/manifest'

const mocks = vi.hoisted(() => ({
  authInterceptor: vi.fn(async (ctx: any) => {
    ctx.locals.session = ctx.request.headers.get('Authorization') === 'Bearer owner-token'
      ? { userId: 7, role: 'member' }
      : { userId: null, role: '' }
  }),
  readActiveByOwner: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ authInterceptor: mocks.authInterceptor }))
vi.mock('@/db/markdown', () => ({ readActiveByOwner: mocks.readActiveByOwner }))

function context(request: Request, oss?: any) {
  return {
    request,
    locals: { runtime: { env: { DB: 'db' } }, OSS: oss, session: { userId: null, role: '' } },
  } as any
}

beforeEach(() => vi.clearAllMocks())

describe('sync manifest API', () => {
  it('requires a Bearer Token and returns only Owner File metadata and scoped Attachment paths', async () => {
    mocks.readActiveByOwner.mockResolvedValue([{
      id: 3,
      path: '/memo/owned',
      renderer: 'markdown',
      sourceHash: 'a'.repeat(64),
      revision: 4,
      updatedAt: new Date('2026-07-29T00:00:00.000Z'),
    }])
    const oss = {
      list: vi.fn().mockResolvedValue({
        truncated: false,
        objects: [{ key: 'sync-attachments/7/diagram.png', size: 12, uploaded: new Date('2026-07-29T01:00:00.000Z'), etag: 'etag' }],
      }),
    }
    const response = await GET(context(new Request('https://koala.test/api/sync/manifest', { headers: { Authorization: 'Bearer owner-token' } }), oss))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      files: [{ id: 3, path: '/memo/owned', renderer: 'markdown', sourceHash: 'a'.repeat(64), revision: 4, updatedAt: '2026-07-29T00:00:00.000Z' }],
      attachments: [{ path: 'diagram.png', size: 12, updatedAt: '2026-07-29T01:00:00.000Z', etag: 'etag' }],
    })
    expect(mocks.readActiveByOwner).toHaveBeenCalledWith({ DB: 'db' }, 7)
    expect(oss.list).toHaveBeenCalledWith({ prefix: 'sync-attachments/7/', cursor: undefined })
  })
})
