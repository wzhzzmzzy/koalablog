import { GET } from '@/pages/api/markdown/batch'

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  authInterceptor: vi.fn(async (ctx: any) => {
    ctx.locals.session = {
      role: ctx.request.headers.get('Authorization') === 'Bearer token' ? 'admin' : '',
    }
  }),
  batchRemoveByLinks: vi.fn(),
  batchUpsert: vi.fn(),
  readAll: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({
  authInterceptor: mocks.authInterceptor,
}))

vi.mock('@/db/markdown', () => ({
  batchRemoveByLinks: mocks.batchRemoveByLinks,
  batchUpsert: mocks.batchUpsert,
  readAll: mocks.readAll,
}))

function createContext(request: Request) {
  return {
    request,
    url: new URL(request.url),
    locals: {
      runtime: { env: { DB: 'db' } },
      session: { role: '' },
    },
  } as any
}

describe('markdown batch API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('lists wiki records when source=wiki', async () => {
    mocks.readAll.mockResolvedValue([
      { id: 1, link: 'wiki/entities/transformer-architecture', subject: 'Transformer Architecture' },
    ])

    const response = await GET(createContext(new Request('https://koala.test/api/markdown/batch?source=wiki', {
      headers: { Authorization: 'Bearer token' },
    })))

    expect(response.status).toBe(200)
    expect(mocks.readAll).toHaveBeenCalledWith({ DB: 'db' }, 31, false)
    expect(await response.json()).toEqual([
      { id: 1, link: 'wiki/entities/transformer-architecture', subject: 'Transformer Architecture' },
    ])
  })
})
