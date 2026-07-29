import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET, POST } from '@/pages/api/workspace/exchange'

const mocks = vi.hoisted(() => ({
  authInterceptor: vi.fn(async (ctx: any) => {
    ctx.locals.session = ctx.request.headers.get('Authorization') === 'session'
      ? { userId: 7, role: 'member' }
      : { userId: null, role: '' }
  }),
  readActiveByOwner: vi.fn(),
  saveSyncedFile: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ authInterceptor: mocks.authInterceptor }))
vi.mock('@/db/markdown', () => ({
  readActiveByOwner: mocks.readActiveByOwner,
  saveSyncedFile: mocks.saveSyncedFile,
}))

function context(request: Request, oss?: any) {
  return { request, locals: { runtime: { env: { DB: 'db' } }, OSS: oss, session: { userId: null, role: '' } } } as any
}

beforeEach(() => vi.clearAllMocks())

describe('dashboard content exchange API', () => {
  it('exports Owner Source and scoped Attachments in the CLI-compatible archive format', async () => {
    mocks.readActiveByOwner.mockResolvedValue([{
      id: 1,
      path: '/notes/plan',
      renderer: 'markdown',
      content: '# Plan',
    }])
    const oss = {
      list: vi.fn().mockResolvedValue({ objects: [{ key: 'sync-attachments/7/diagram.png' }], truncated: false }),
      get: vi.fn().mockResolvedValue({ arrayBuffer: async () => new TextEncoder().encode('png').buffer }),
    }

    const response = await GET(context(new Request('https://koala.test/api/workspace/exchange', { headers: { Authorization: 'session' } }), oss))
    const archive = unzipSync(new Uint8Array(await response.arrayBuffer()))

    expect(response.status).toBe(200)
    expect(strFromU8(archive['notes/plan.md'])).toBe('# Plan')
    expect(strFromU8(archive['attachments/diagram.png'])).toBe('png')
    expect(oss.list).toHaveBeenCalledWith({ prefix: 'sync-attachments/7/', cursor: undefined })
  })

  it('imports new Source privately, skips collisions, and reports Svelte rebuild requirements', async () => {
    mocks.readActiveByOwner.mockResolvedValue([{ path: '/notes/existing' }])
    mocks.saveSyncedFile.mockResolvedValue({ status: 'saved', file: { id: 3 } })
    const oss = {
      list: vi.fn().mockResolvedValue({ objects: [], truncated: false }),
      put: vi.fn(),
    }
    const archive = zipSync({
      'notes/existing.md': strToU8('do not overwrite'),
      'widgets/demo.svelte': strToU8('<h1>Demo</h1>'),
      'attachments/report.pdf': new Uint8Array([1, 2]),
      '.koala/sync-state.json': strToU8('{}'),
    })

    const response = await POST(context(new Request('https://koala.test/api/workspace/exchange', {
      method: 'POST',
      headers: { Authorization: 'session' },
      body: archive,
    }), oss))

    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({
      created: ['/widgets/demo'],
      skippedExisting: ['/notes/existing'],
      rebuildRequired: ['/widgets/demo'],
      attachments: { created: ['report.pdf'] },
    })
    expect(mocks.saveSyncedFile).toHaveBeenCalledWith({ DB: 'db' }, expect.objectContaining({
      path: '/widgets/demo',
      private: true,
      userId: 7,
    }))
    expect(oss.put).toHaveBeenCalledWith('sync-attachments/7/report.pdf', expect.any(Uint8Array), expect.any(Object))
  })
})
