import { beforeEach, describe, expect, it, vi } from 'vitest'
import { authInterceptor } from '@/lib/auth'
import { requireSyncOwner } from '@/lib/sync/api'

const mocks = vi.hoisted(() => ({
  findApiTokenByHash: vi.fn(),
  findUserById: vi.fn(),
  hashApiToken: vi.fn(),
  readSession: vi.fn(),
}))

vi.mock('@/db/user', () => ({ findApiTokenByHash: mocks.findApiTokenByHash, findUserById: mocks.findUserById }))
vi.mock('@/lib/auth/api-token', () => ({ hashApiToken: mocks.hashApiToken }))
vi.mock('@/lib/auth/session', () => ({ readSession: mocks.readSession, SESSION_COOKIE_NAME: 'koala-session' }))

function context(authorization?: string, sessionId?: string) {
  const request = new Request('https://koala.test/api/sync/files/3', {
    headers: authorization === undefined ? {} : { Authorization: authorization },
  })
  return {
    request,
    url: new URL(request.url),
    cookies: { get: () => sessionId ? { value: sessionId } : undefined },
    locals: { runtime: { env: {} }, session: { userId: null, role: '' } },
  } as any
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.hashApiToken.mockImplementation(async value => value)
  mocks.findApiTokenByHash.mockImplementation(async (_env, token) => token === 'valid' ? { userId: 7 } : undefined)
  mocks.findUserById.mockResolvedValue({ id: 7, role: 'member' })
  mocks.readSession.mockResolvedValue({ userId: 42, role: 'admin', expiresAt: Date.now() + 60000 })
})

describe('request-scoped authentication', () => {
  it('reuses Bearer verification from middleware in the API-only guard', async () => {
    const ctx = context('Bearer valid', 'other-owner')
    await authInterceptor(ctx)
    expect(await requireSyncOwner(ctx)).toEqual({ userId: 7 })
    expect(mocks.hashApiToken).toHaveBeenCalledTimes(1)
    expect(mocks.findApiTokenByHash).toHaveBeenCalledTimes(1)
    expect(mocks.findUserById).toHaveBeenCalledTimes(1)
    expect(mocks.readSession).not.toHaveBeenCalled()
  })

  it('shares an in-flight verification between contexts for the same Request', async () => {
    const first = context('Bearer valid')
    const second = { ...first, locals: { ...first.locals } }
    await Promise.all([authInterceptor(first), authInterceptor(second, { allowSession: false })])
    expect(first.locals.session).toEqual({ userId: 7, role: 'member' })
    expect(second.locals.session).toEqual(first.locals.session)
    expect(mocks.findApiTokenByHash).toHaveBeenCalledTimes(1)
    expect(mocks.findUserById).toHaveBeenCalledTimes(1)
  })

  it('does not promote a cached cookie identity into API Token authorization', async () => {
    const ctx = context('Bearer wrong', 'valid-cookie')
    await authInterceptor(ctx)
    expect(ctx.locals.session.userId).toBe(42)
    const authorization = await requireSyncOwner(ctx)
    expect('response' in authorization && authorization.response.status).toBe(401)
    expect(ctx.locals.session.userId).toBeNull()
    expect(mocks.findApiTokenByHash).toHaveBeenCalledTimes(1)
    expect(mocks.readSession).toHaveBeenCalledTimes(1)
    await authInterceptor(ctx)
    expect(ctx.locals.session.userId).toBe(42)
    expect(mocks.readSession).toHaveBeenCalledTimes(1)
  })

  it('can resolve a cookie after an API-only check without rereading the Bearer token', async () => {
    const ctx = context('Bearer wrong', 'valid-cookie')
    await authInterceptor(ctx, { allowSession: false })
    expect(ctx.locals.session.userId).toBeNull()
    expect(mocks.readSession).not.toHaveBeenCalled()
    await authInterceptor(ctx)
    expect(ctx.locals.session.userId).toBe(42)
    expect(mocks.findApiTokenByHash).toHaveBeenCalledTimes(1)
  })

  it('reuses a Session lookup without allowing cookie-only sync requests', async () => {
    const ctx = context(undefined, 'valid-cookie')
    await Promise.all([authInterceptor(ctx), authInterceptor(ctx)])
    expect(mocks.readSession).toHaveBeenCalledTimes(1)
    const authorization = await requireSyncOwner(ctx)
    expect('response' in authorization && authorization.response.status).toBe(401)
    expect(mocks.findApiTokenByHash).not.toHaveBeenCalled()
  })

  it('checks revocation again on the next Request, even for the same token', async () => {
    await authInterceptor(context('Bearer valid'))
    mocks.findApiTokenByHash.mockResolvedValue(undefined)
    const next = context('Bearer valid')
    await authInterceptor(next)
    expect(next.locals.session.userId).toBeNull()
    expect(mocks.findApiTokenByHash).toHaveBeenCalledTimes(2)
  })

  it('does not trust mutations to locals.session or changed Authorization headers', async () => {
    const ctx = context('Bearer valid')
    await authInterceptor(ctx)
    ctx.locals.session.userId = 999
    ctx.locals.session.role = 'admin'
    await authInterceptor(ctx)
    expect(ctx.locals.session).toEqual({ userId: 7, role: 'member' })
    ctx.request.headers.set('Authorization', 'Bearer wrong')
    await authInterceptor(ctx, { allowSession: false })
    expect(ctx.locals.session.userId).toBeNull()
    expect(mocks.findApiTokenByHash).toHaveBeenCalledTimes(2)
  })

  it('does not share authentication across environment bindings', async () => {
    const ctx = context('Bearer valid')
    await authInterceptor(ctx)
    ctx.locals.runtime.env = {}
    mocks.findUserById.mockResolvedValue(undefined)
    await authInterceptor(ctx, { allowSession: false })
    expect(ctx.locals.session.userId).toBeNull()
    expect(mocks.findUserById).toHaveBeenCalledTimes(2)
  })

  it('fails closed when credential storage fails instead of using a cookie', async () => {
    const ctx = context('Bearer valid', 'valid-cookie')
    mocks.findApiTokenByHash.mockRejectedValue(new Error('unavailable'))
    await expect(authInterceptor(ctx)).rejects.toThrow('unavailable')
    await expect(authInterceptor(ctx, { allowSession: false })).rejects.toThrow('unavailable')
    expect(mocks.findApiTokenByHash).toHaveBeenCalledTimes(1)
    expect(mocks.readSession).not.toHaveBeenCalled()
  })
})
