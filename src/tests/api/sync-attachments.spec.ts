import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DELETE, GET, PUT } from '@/pages/api/sync/attachments/[...path]'

const mocks = vi.hoisted(() => ({
  authInterceptor: vi.fn(async (ctx: any) => {
    ctx.locals.session = ctx.request.headers.get('Authorization') === 'Bearer owner-token'
      ? { userId: 7, role: 'member' }
      : { userId: null, role: '' }
  }),
}))

vi.mock('@/lib/auth', () => ({ authInterceptor: mocks.authInterceptor }))

function context(request: Request, oss: any, path = 'diagram.png') {
  return { request, params: { path }, locals: { OSS: oss, runtime: { env: {} }, session: { userId: null, role: '' } } } as any
}

beforeEach(() => vi.clearAllMocks())

describe('sync Attachment API', () => {
  it('uses the Bearer Token Owner storage prefix for download, upload, and delete', async () => {
    const oss = {
      get: vi.fn().mockResolvedValue({ body: new TextEncoder().encode('image').buffer, httpMetadata: { contentType: 'image/png' } }),
      put: vi.fn(),
      delete: vi.fn(),
    }
    const headers = { 'Authorization': 'Bearer owner-token', 'Content-Type': 'image/png' }
    const get = await GET(context(new Request('https://koala.test/api/sync/attachments/diagram.png', { headers }), oss))
    expect(get.status).toBe(200)
    expect(get.headers.get('Content-Type')).toBe('image/png')
    expect(oss.get).toHaveBeenCalledWith('sync-attachments/7/diagram.png')

    const put = await PUT(context(new Request('https://koala.test/api/sync/attachments/diagram.png', { method: 'PUT', headers, body: 'image' }), oss))
    expect(put.status).toBe(201)
    expect(oss.put).toHaveBeenCalledWith('sync-attachments/7/diagram.png', expect.any(ArrayBuffer), expect.objectContaining({ httpMetadata: { contentType: 'image/png' } }))

    const remove = await DELETE(context(new Request('https://koala.test/api/sync/attachments/diagram.png', { method: 'DELETE', headers }), oss))
    expect(remove.status).toBe(200)
    expect(oss.delete).toHaveBeenCalledWith('sync-attachments/7/diagram.png')
  })

  it('rejects anonymous and traversal requests', async () => {
    const oss = { get: vi.fn(), put: vi.fn(), delete: vi.fn() }
    const anonymous = await GET(context(new Request('https://koala.test/api/sync/attachments/diagram.png'), oss))
    expect(anonymous.status).toBe(401)
    const traversal = await PUT(context(new Request('https://koala.test/api/sync/attachments/../secret', { method: 'PUT', headers: { Authorization: 'Bearer owner-token' } }), oss, '../secret'))
    expect(traversal.status).toBe(400)
    expect(oss.put).not.toHaveBeenCalled()
  })
})
