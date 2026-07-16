import { DELETE, GET } from '@/pages/api/markdown/batch'

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  authInterceptor: vi.fn(async (ctx: any) => {
    ctx.locals.session = {
      role: ctx.request.headers.get('Authorization') === 'Bearer token' ? 'admin' : '',
    }
  }),
  batchTrashByLinks: vi.fn(),
  batchUpsert: vi.fn(),
  readAll: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({
  authInterceptor: mocks.authInterceptor,
}))

vi.mock('@/db/markdown', () => ({
  batchTrashByLinks: mocks.batchTrashByLinks,
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
    expect(mocks.readAll).toHaveBeenCalledWith({ DB: 'db' }, 31)
    expect(await response.json()).toEqual([
      { id: 1, link: 'wiki/entities/transformer-architecture', subject: 'Transformer Architecture' },
    ])
  })

  it('returns one explicit soft-delete result for every requested link', async () => {
    mocks.batchTrashByLinks.mockResolvedValue([
      { status: 'trashed', link: 'wiki/a', document: { id: 1 } },
      { status: 'not_found', link: 'wiki/missing' },
    ])

    const response = await DELETE(createContext(new Request('https://koala.test/api/markdown/batch', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer token' },
      body: JSON.stringify(['wiki/a', 'wiki/missing']),
    })))

    expect(response.status).toBe(200)
    expect(mocks.batchTrashByLinks).toHaveBeenCalledWith({ DB: 'db' }, ['wiki/a', 'wiki/missing'])
    expect(await response.json()).toMatchObject({
      success: true,
      count: 1,
      results: [
        { status: 'trashed', link: 'wiki/a' },
        { status: 'not_found', link: 'wiki/missing' },
      ],
    })
  })
})
