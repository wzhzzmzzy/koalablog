import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  authInterceptor: vi.fn(async (ctx: any) => {
    ctx.locals.session = {
      role: ctx.request.headers.get('Authorization') === 'Bearer token' ? 'admin' : '',
    }
  }),
  readRemoteTruth: vi.fn(),
  clearRemoteTruth: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({
  authInterceptor: mocks.authInterceptor,
}))

vi.mock('@/db/markdown', () => ({
  clearRemoteTruth: mocks.clearRemoteTruth,
  readRemoteTruth: mocks.readRemoteTruth,
}))

import { GET, POST } from '@/pages/api/markdown/remote-truth'

function createContext(request: Request) {
  return {
    request,
    locals: {
      runtime: { env: { DB: 'db' } },
      session: { role: '' },
    },
  } as any
}

describe('markdown remote-truth API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns remote truth records for bearer-authenticated admins', async () => {
    const items = [
      { id: 1, link: 'memo/one', subject: 'One', content: '# One' },
    ]
    mocks.readRemoteTruth.mockResolvedValue(items)

    const response = await GET(createContext(new Request('https://koala.test/api/markdown/remote-truth', {
      headers: { Authorization: 'Bearer token' },
    })))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(items)
    expect(mocks.readRemoteTruth).toHaveBeenCalledWith({ DB: 'db' })
  })

  it('clears one or many remote truth markers for bearer-authenticated admins', async () => {
    mocks.clearRemoteTruth.mockResolvedValue(undefined)

    const single = await POST(createContext(new Request('https://koala.test/api/markdown/remote-truth', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id: 1 }),
    })))

    const many = await POST(createContext(new Request('https://koala.test/api/markdown/remote-truth', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ids: [2, 3] }),
    })))

    expect(single.status).toBe(200)
    expect(many.status).toBe(200)
    expect(await single.json()).toEqual({ success: true })
    expect(await many.json()).toEqual({ success: true })
    expect(mocks.clearRemoteTruth).toHaveBeenNthCalledWith(1, { DB: 'db' }, 1)
    expect(mocks.clearRemoteTruth).toHaveBeenNthCalledWith(2, { DB: 'db' }, 2)
    expect(mocks.clearRemoteTruth).toHaveBeenNthCalledWith(3, { DB: 'db' }, 3)
  })
})
