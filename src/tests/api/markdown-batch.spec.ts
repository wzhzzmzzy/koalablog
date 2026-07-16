import { DELETE, GET, POST } from '@/pages/api/markdown/batch'

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  authInterceptor: vi.fn(async (ctx: any) => {
    ctx.locals.session = {
      role: ctx.request.headers.get('Authorization') === 'Bearer token' ? 'admin' : '',
    }
  }),
  batchTrashByPaths: vi.fn(),
  batchUpsert: vi.fn(),
  readAll: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({
  authInterceptor: mocks.authInterceptor,
}))

vi.mock('@/db/markdown', () => ({
  batchTrashByPaths: mocks.batchTrashByPaths,
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
      { id: 1, path: '/wiki/entities/transformer-architecture', title: 'transformer-architecture', revision: 3 },
    ])

    const response = await GET(createContext(new Request('https://koala.test/api/markdown/batch?source=wiki', {
      headers: { Authorization: 'Bearer token' },
    })))

    expect(response.status).toBe(200)
    expect(mocks.readAll).toHaveBeenCalledWith({ DB: 'db' }, 31)
    expect(await response.json()).toEqual([
      { id: 1, path: '/wiki/entities/transformer-architecture', title: 'transformer-architecture', revision: 3 },
    ])
  })

  it('returns one explicit soft-delete result for every requested Path', async () => {
    mocks.batchTrashByPaths.mockResolvedValue([
      { status: 'trashed', path: '/wiki/a', file: { id: 1 } },
      { status: 'not_found', path: '/wiki/missing' },
    ])

    const response = await DELETE(createContext(new Request('https://koala.test/api/markdown/batch', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer token' },
      body: JSON.stringify(['/wiki/a', '/wiki/missing']),
    })))

    expect(response.status).toBe(200)
    expect(mocks.batchTrashByPaths).toHaveBeenCalledWith({ DB: 'db' }, ['/wiki/a', '/wiki/missing'])
    expect(await response.json()).toMatchObject({
      success: true,
      count: 1,
      results: [
        { status: 'trashed', path: '/wiki/a' },
        { status: 'not_found', path: '/wiki/missing' },
      ],
    })
  })

  it('rejects an independently supplied Title from batch Source writes', async () => {
    const response = await POST(createContext(new Request('https://koala.test/api/markdown/batch', {
      method: 'POST',
      headers: { Authorization: 'Bearer token' },
      body: JSON.stringify([{
        path: '/wiki/architecture',
        title: 'Independent title',
        content: '# Architecture',
        private: false,
      }]),
    })))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'File input must not include title' })
    expect(mocks.batchUpsert).not.toHaveBeenCalled()
  })
})
