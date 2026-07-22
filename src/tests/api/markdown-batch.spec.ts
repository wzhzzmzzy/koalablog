import { DELETE, GET, POST } from '@/pages/api/markdown/batch'

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  authInterceptor: vi.fn(async (ctx: any) => {
    ctx.locals.session = {
      role: ctx.request.headers.get('Authorization') === 'Bearer token' ? 'admin' : '',
    }
  }),
  batchTrashByPaths: vi.fn(),
  readAll: vi.fn(),
  saveSyncedFile: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({
  authInterceptor: mocks.authInterceptor,
}))

vi.mock('@/db/markdown', () => ({
  batchTrashByPaths: mocks.batchTrashByPaths,
  FileInputError: class FileInputError extends Error {},
  readAll: mocks.readAll,
  saveSyncedFile: mocks.saveSyncedFile,
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

beforeEach(() => {
  vi.clearAllMocks()
})

describe('markdown batch API reads and deletes', () => {
  it('lists wiki records when source=wiki', async () => {
    mocks.readAll.mockResolvedValue([
      {
        id: 1,
        path: '/wiki/entities/transformer-architecture',
        title: 'transformer-architecture',
        renderer: 'markdown',
        sourceHash: 'stored-source-hash',
        revision: 3,
      },
    ])

    const response = await GET(createContext(new Request('https://koala.test/api/markdown/batch?source=wiki', {
      headers: { Authorization: 'Bearer token' },
    })))

    expect(response.status).toBe(200)
    expect(mocks.readAll).toHaveBeenCalledWith({ DB: 'db' }, 31)
    expect(await response.json()).toEqual([
      {
        id: 1,
        path: '/wiki/entities/transformer-architecture',
        title: 'transformer-architecture',
        renderer: 'markdown',
        sourceHash: 'stored-source-hash',
        artifactStatus: 'not_applicable',
        revision: 3,
      },
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
})

describe('markdown batch API Source validation', () => {
  it('rejects an independently supplied Title from batch Source writes', async () => {
    const response = await POST(createContext(new Request('https://koala.test/api/markdown/batch', {
      method: 'POST',
      headers: { Authorization: 'Bearer token' },
      body: JSON.stringify([{
        path: '/wiki/architecture',
        id: 1,
        baseRevision: 3,
        title: 'Independent title',
        content: '# Architecture',
        private: false,
      }]),
    })))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'File input must not include title' })
    expect(mocks.saveSyncedFile).not.toHaveBeenCalled()
  })

  it('requires optimistic revision fields for every batch Source write', async () => {
    const response = await POST(createContext(new Request('https://koala.test/api/markdown/batch', {
      method: 'POST',
      headers: { Authorization: 'Bearer token' },
      body: JSON.stringify([{
        path: '/wiki/architecture',
        content: '# Architecture',
        private: false,
      }]),
    })))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Every File input requires id and baseRevision integers' })
    expect(mocks.saveSyncedFile).not.toHaveBeenCalled()
  })

  it('rejects remote-truth state because the server derives sync metadata', async () => {
    const response = await POST(createContext(new Request('https://koala.test/api/markdown/batch', {
      method: 'POST',
      headers: { Authorization: 'Bearer token' },
      body: JSON.stringify([{
        id: 1,
        path: '/wiki/architecture',
        content: '# Architecture',
        private: false,
        baseRevision: 3,
        remoteTruth: true,
      }]),
    })))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'File metadata is derived by the server' })
    expect(mocks.saveSyncedFile).not.toHaveBeenCalled()
  })

  it('rejects an unknown Renderer before saving Source', async () => {
    const response = await POST(createContext(new Request('https://koala.test/api/markdown/batch', {
      method: 'POST',
      headers: { Authorization: 'Bearer token' },
      body: JSON.stringify([{
        id: 1,
        path: '/wiki/architecture',
        renderer: 'html',
        content: '# Architecture',
        private: false,
        baseRevision: 3,
      }]),
    })))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'File renderer must be markdown or svelte' })
    expect(mocks.saveSyncedFile).not.toHaveBeenCalled()
  })
})

describe('markdown batch API optimistic Source writes', () => {
  it('returns HTTP 409 with the current File when a batch Source precondition is stale', async () => {
    const current = {
      id: 1,
      path: '/wiki/architecture',
      title: 'architecture',
      renderer: 'markdown',
      content: 'server Source',
      sourceHash: 'server-source-hash',
      revision: 4,
    }
    mocks.saveSyncedFile.mockResolvedValue({ status: 'conflict', current })

    const response = await POST(createContext(new Request('https://koala.test/api/markdown/batch', {
      method: 'POST',
      headers: { Authorization: 'Bearer token' },
      body: JSON.stringify([{
        id: 1,
        path: '/wiki/architecture',
        content: 'local Source',
        private: false,
        baseRevision: 3,
      }]),
    })))

    expect(response.status).toBe(409)
    expect(mocks.saveSyncedFile).toHaveBeenCalledWith({ DB: 'db' }, {
      id: 1,
      path: '/wiki/architecture',
      renderer: 'markdown',
      content: 'local Source',
      private: false,
      baseRevision: 3,
    })
    expect(await response.json()).toEqual({
      error: 'source_conflict',
      results: [{ status: 'conflict', current }],
    })
  })

  it('returns the new revision after a preconditioned batch Source Save', async () => {
    mocks.saveSyncedFile.mockResolvedValue({
      status: 'saved',
      file: {
        id: 1,
        path: '/wiki/architecture',
        title: 'architecture',
        renderer: 'markdown',
        sourceHash: 'f22a36807e299b6fba30270ddf4a78edc542b12146be91c0e639a3bbd7a4042d',
        revision: 4,
      },
    })

    const response = await POST(createContext(new Request('https://koala.test/api/markdown/batch', {
      method: 'POST',
      headers: { Authorization: 'Bearer token' },
      body: JSON.stringify([{
        id: 1,
        path: '/wiki/architecture',
        content: 'next Source',
        private: false,
        baseRevision: 3,
      }]),
    })))

    expect(response.status).toBe(200)
    expect(mocks.saveSyncedFile).toHaveBeenCalledWith({ DB: 'db' }, {
      id: 1,
      path: '/wiki/architecture',
      renderer: 'markdown',
      content: 'next Source',
      private: false,
      baseRevision: 3,
    })
    expect(await response.json()).toEqual({
      success: true,
      count: 1,
      results: [{
        id: 1,
        path: '/wiki/architecture',
        title: 'architecture',
        renderer: 'markdown',
        sourceHash: 'f22a36807e299b6fba30270ddf4a78edc542b12146be91c0e639a3bbd7a4042d',
        artifactStatus: 'not_applicable',
        revision: 4,
      }],
    })
  })

  it('accepts Svelte Source and reports that a browser Rebuild is required', async () => {
    mocks.saveSyncedFile.mockResolvedValue({
      status: 'saved',
      file: {
        id: 2,
        path: '/page/application',
        title: 'application',
        renderer: 'svelte',
        sourceHash: 'svelte-source-hash',
        revision: 5,
      },
    })

    const response = await POST(createContext(new Request('https://koala.test/api/markdown/batch', {
      method: 'POST',
      headers: { Authorization: 'Bearer token' },
      body: JSON.stringify([{
        id: 2,
        path: '/page/application',
        renderer: 'svelte',
        content: '<h1>Application</h1>',
        private: false,
        baseRevision: 4,
      }]),
    })))

    expect(response.status).toBe(200)
    expect(mocks.saveSyncedFile).toHaveBeenCalledWith({ DB: 'db' }, {
      id: 2,
      path: '/page/application',
      renderer: 'svelte',
      content: '<h1>Application</h1>',
      private: false,
      baseRevision: 4,
    })
    expect(await response.json()).toEqual({
      success: true,
      count: 1,
      results: [{
        id: 2,
        path: '/page/application',
        title: 'application',
        renderer: 'svelte',
        sourceHash: 'svelte-source-hash',
        artifactStatus: 'rebuild_required',
        revision: 5,
      }],
    })
  })
})
