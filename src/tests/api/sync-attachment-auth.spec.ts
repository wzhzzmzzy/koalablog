import { beforeEach, describe, expect, it, vi } from 'vitest'
import { hashApiToken } from '@/lib/auth/api-token'
import { SESSION_COOKIE_NAME } from '@/lib/auth/session'
import { DELETE, GET, PUT } from '@/pages/api/sync/attachments/[...path]'
import { GET as getFile } from '@/pages/api/sync/files/[id]'
import { GET as getManifest } from '@/pages/api/sync/manifest'

const users = vi.hoisted(() => ({
  findApiTokenByHash: vi.fn(),
  findUserById: vi.fn(),
}))
vi.mock('@/db/user', () => users)

// Exercise the real authInterceptor and Session expiry checks, not an auth mock.
function fixture() {
  const sessions = new Map([
    ['session:owner-session', { userId: 7, role: 'member', expiresAt: Date.now() + 60000 }],
    ['session:other-session', { userId: 8, role: 'member', expiresAt: Date.now() + 60000 }],
    ['session:expired-session', { userId: 7, role: 'member', expiresAt: Date.now() - 1 }],
  ])
  const objects = new Map<string, ArrayBuffer>()
  const oss = {
    get: vi.fn(async (key: string) => {
      const body = objects.get(key)
      return body ? { body, httpMetadata: { contentType: 'application/octet-stream' } } : null
    }),
    put: vi.fn(async (key: string, body: ArrayBuffer) => { objects.set(key, body) }),
    delete: vi.fn(async (key: string) => { objects.delete(key) }),
  }
  const context = (method: string, headers: HeadersInit = {}, sessionId?: string) => {
    const request = new Request('https://koala.test/api/sync/attachments/game-saves/auto.bin', {
      method,
      headers,
      ...(method === 'PUT' ? { body: 'checkpoint' } : {}),
    })
    return {
      request,
      url: new URL(request.url),
      params: { path: 'game-saves/auto.bin', id: '1' },
      cookies: { get: (key: string) => key === SESSION_COOKIE_NAME && sessionId ? { value: sessionId } : undefined },
      locals: {
        OSS: oss,
        runtime: { env: { sessionKv: { get: async (key: string) => sessions.get(key) } } },
        // Middleware may have already resolved the Cookie before the route guard.
        session: { userId: 99, role: 'member' },
      },
    } as any
  }
  return { context, oss, objects }
}

beforeEach(async () => {
  vi.clearAllMocks()
  const hash = await hashApiToken('owner-token')
  users.findApiTokenByHash.mockImplementation(async (_env, value) => value === hash ? { userId: 7 } : undefined)
  users.findUserById.mockImplementation(async (_env, id) => id === 7 ? { id, role: 'member' } : undefined)
})

describe('attachment Session authentication', () => {
  it('lets a member upload, read and delete their own binary Attachment with a Session', async () => {
    const { context, oss } = fixture()
    const headers = { 'Origin': 'https://koala.test', 'Sec-Fetch-Site': 'same-origin', 'Content-Type': 'application/octet-stream' }
    expect((await PUT(context('PUT', headers, 'owner-session'))).status).toBe(201)
    const read = await GET(context('GET', {}, 'owner-session'))
    expect(read.status).toBe(200)
    expect(read.headers.get('Cache-Control')).toBe('private, no-store')
    expect(await read.text()).toBe('checkpoint')
    expect((await DELETE(context('DELETE', headers, 'owner-session'))).status).toBe(200)
    expect(oss.put).toHaveBeenCalledWith('sync-attachments/7/game-saves/auto.bin', expect.any(ArrayBuffer), expect.any(Object))
    expect(oss.get).toHaveBeenCalledWith('sync-attachments/7/game-saves/auto.bin')
    expect(oss.delete).toHaveBeenCalledWith('sync-attachments/7/game-saves/auto.bin')
    expect(users.findApiTokenByHash).not.toHaveBeenCalled()
  })

  it('keeps the same Attachment path isolated between Session owners', async () => {
    const { context, objects } = fixture()
    const headers = { Origin: 'https://koala.test' }
    await PUT(context('PUT', headers, 'owner-session'))
    expect((await GET(context('GET', {}, 'other-session'))).status).toBe(404)
    await PUT(context('PUT', headers, 'other-session'))
    await DELETE(context('DELETE', headers, 'other-session'))
    expect(objects.has('sync-attachments/7/game-saves/auto.bin')).toBe(true)
    expect(await (await GET(context('GET', {}, 'owner-session'))).text()).toBe('checkpoint')
  })

  it.each([undefined, 'missing-session', 'expired-session'])('rejects an absent or expired Session (%s)', async (sessionId) => {
    const { context, oss } = fixture()
    for (const [method, handler] of [['GET', GET], ['PUT', PUT], ['DELETE', DELETE]] as const) {
      expect((await handler(context(method, { Origin: 'https://koala.test' }, sessionId))).status).toBe(401)
    }
    expect(oss.get).not.toHaveBeenCalled()
    expect(oss.put).not.toHaveBeenCalled()
    expect(oss.delete).not.toHaveBeenCalled()
  })

  it.each([
    {},
    { Origin: 'null' },
    { Origin: 'https://foreign.test' },
    { Origin: 'https://sub.koala.test' },
    { Origin: 'http://koala.test' },
    { Origin: 'https://koala.test:444' },
    { 'Origin': 'https://koala.test', 'Sec-Fetch-Site': 'cross-site' },
    { 'Origin': 'https://koala.test', 'Sec-Fetch-Site': 'same-site' },
  ])('blocks unproven or cross-origin Cookie writes: %j', async (headers) => {
    const { context, oss } = fixture()
    for (const [method, handler] of [['PUT', PUT], ['DELETE', DELETE]] as const) {
      expect((await handler(context(method, headers, 'owner-session'))).status).toBe(403)
    }
    expect(oss.put).not.toHaveBeenCalled()
    expect(oss.delete).not.toHaveBeenCalled()
  })

  it.each([
    { Origin: 'https://foreign.test' },
    { 'Sec-Fetch-Site': 'cross-site' },
    { 'Sec-Fetch-Site': 'same-site' },
  ])('rejects cross-origin Cookie reads: %j', async (headers) => {
    const { context, oss } = fixture()
    expect((await GET(context('GET', headers, 'owner-session'))).status).toBe(403)
    expect(oss.get).not.toHaveBeenCalled()
  })

  it.each(['Bearer wrong', 'Bearer ', 'Basic owner-token', ''])('never falls back to a valid Session for explicit Authorization: %j', async (authorization) => {
    const { context, oss } = fixture()
    for (const [method, handler] of [['GET', GET], ['PUT', PUT], ['DELETE', DELETE]] as const) {
      const headers = { Authorization: authorization, Origin: 'https://koala.test' }
      expect((await handler(context(method, headers, 'owner-session'))).status).toBe(401)
    }
    expect(oss.get).not.toHaveBeenCalled()
    expect(oss.put).not.toHaveBeenCalled()
    expect(oss.delete).not.toHaveBeenCalled()
  })

  it('keeps API Token requests independent of Cookie identity and browser Origin', async () => {
    const { context, oss } = fixture()
    const headers = { Authorization: 'Bearer owner-token' }
    expect((await PUT(context('PUT', headers, 'other-session'))).status).toBe(201)
    expect(await (await GET(context('GET', headers))).text()).toBe('checkpoint')
    expect((await DELETE(context('DELETE', { ...headers, Origin: 'https://foreign.test' }, 'other-session'))).status).toBe(200)
    expect(oss.put).toHaveBeenCalledWith('sync-attachments/7/game-saves/auto.bin', expect.any(ArrayBuffer), expect.any(Object))
    expect(oss.delete).toHaveBeenCalledWith('sync-attachments/7/game-saves/auto.bin')
  })

  it('still rejects path traversal for Session requests', async () => {
    const { context, oss } = fixture()
    const ctx = context('PUT', { Origin: 'https://koala.test' }, 'owner-session')
    ctx.params.path = '../8/game-saves/auto.bin'
    expect((await PUT(ctx)).status).toBe(400)
    expect(oss.put).not.toHaveBeenCalled()
  })

  it('keeps File and manifest sync endpoints API Token-only', async () => {
    const { context } = fixture()
    for (const handler of [getFile, getManifest]) {
      expect((await handler(context('GET', {}, 'owner-session'))).status).toBe(401)
      expect((await handler(context('GET', { Authorization: 'Bearer wrong' }, 'owner-session'))).status).toBe(401)
    }
  })
})
