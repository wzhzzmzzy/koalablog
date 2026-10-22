import { beforeEach, describe, expect, it, vi } from 'vitest'
import { onRequest } from '@/middleware'

const mocks = vi.hoisted(() => ({
  ensureTemplateCatalogInitialized: vi.fn(),
  ensureUserMigration: vi.fn(),
  globalConfig: vi.fn(),
  getActionContext: vi.fn(),
  authInterceptor: vi.fn(async (ctx: any) => {
    ctx.locals.session = { userId: null, role: '' }
  }),
}))

vi.mock('@/db/template-catalog', () => ({ ensureTemplateCatalogInitialized: mocks.ensureTemplateCatalogInitialized }))
vi.mock('@/db/user-migration', () => ({ ensureUserMigration: mocks.ensureUserMigration }))
vi.mock('@/lib/kv', () => ({ globalConfig: mocks.globalConfig }))
vi.mock('@/lib/auth', () => ({ authInterceptor: mocks.authInterceptor }))
vi.mock('@/lib/blob-storage', () => ({ SQLiteBlobStorage: class {} }))
vi.mock('astro:actions', () => ({ getActionContext: mocks.getActionContext }))

function context(pathname: string, method = 'GET') {
  const request = new Request(`https://koala.test${pathname}`, { method })
  return {
    request,
    url: new URL(request.url),
    locals: { runtime: { env: {} } },
    redirect: vi.fn(path => new Response(null, { status: 302, headers: { Location: path } })),
  } as any
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.globalConfig.mockResolvedValue({ _runtime: { ready: true } })
  mocks.getActionContext.mockReturnValue({ action: undefined })
})

describe('read-only request initialization', () => {
  it.each(['/api/sync/files/3', '/api/health', '/post/example'])('never initializes or migrates on the first or later read of %s', async (pathname) => {
    for (const method of ['GET', 'HEAD']) {
      const next = vi.fn(async () => new Response('read'))
      expect((await onRequest(context(pathname, method), next))?.status).toBe(200)
      expect(next).toHaveBeenCalledTimes(1)
    }
    expect(mocks.authInterceptor).toHaveBeenCalledTimes(2)
    expect(mocks.ensureTemplateCatalogInitialized).not.toHaveBeenCalled()
    expect(mocks.ensureUserMigration).not.toHaveBeenCalled()
  })

  it('does not initialize during a read-only Action POST either', async () => {
    mocks.getActionContext.mockReturnValue({ action: {} })
    const next = vi.fn(async () => new Response('[]'))
    await onRequest(context('/_actions/db.markdown.byPrefix', 'POST'), next)
    expect(next).toHaveBeenCalledTimes(1)
    expect(mocks.ensureTemplateCatalogInitialized).not.toHaveBeenCalled()
    expect(mocks.ensureUserMigration).not.toHaveBeenCalled()
  })

  it('still routes new installations to onboarding without initializing them on GET', async () => {
    mocks.globalConfig.mockResolvedValue({ _runtime: { ready: false } })
    const next = vi.fn(async () => new Response('onboarding'))
    const response = await onRequest(context('/'), next)
    expect(response?.headers.get('Location')).toBe('/onboarding')
    expect(next).not.toHaveBeenCalled()
    expect((await onRequest(context('/onboarding'), next))?.status).toBe(200)
    expect(mocks.ensureTemplateCatalogInitialized).not.toHaveBeenCalled()
    expect(mocks.ensureUserMigration).not.toHaveBeenCalled()
  })

  it('retains dashboard authentication and form CSRF checks', async () => {
    const next = vi.fn(async () => new Response('ok'))
    const response = await onRequest(context('/dashboard'), next)
    expect(response?.status).toBe(302)
    const ctx = context('/_actions/form.settings', 'POST')
    ctx.request.headers.set('Content-Type', 'application/x-www-form-urlencoded')
    ctx.request.headers.set('Origin', 'https://foreign.test')
    expect((await onRequest(ctx, next))?.status).toBe(403)
    expect(next).not.toHaveBeenCalled()
  })
})
