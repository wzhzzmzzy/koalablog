import { batchImport } from '@/actions/db/markdown'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  authGuard: vi.fn(),
  batchAdd: vi.fn(),
  sourceHashMaintenanceWriteGuard: vi.fn(),
}))

vi.mock('@/actions/utils/auth', () => ({ authGuard: mocks.authGuard, sourceHashMaintenanceWriteGuard: mocks.sourceHashMaintenanceWriteGuard }))
vi.mock('@/db/markdown', () => ({ batchAdd: mocks.batchAdd }))

const context = { locals: { runtime: { env: { DB: 'db' } }, session: { role: 'admin' } } } as any

describe('file disk import action', () => {
  beforeEach(() => vi.clearAllMocks())

  it('preserves Renderer and Source verbatim while applying Visibility Default from the absolute Path', async () => {
    const source = '---\ncustom: user-owned\n---\n\nBody'
    mocks.batchAdd.mockResolvedValue([{ id: 1, path: '/memo/note', title: 'note', content: source }])

    await batchImport.orThrow.call(context, [
      { path: '/memo/note', renderer: 'markdown', content: source },
      { path: '/post/note', renderer: 'svelte', content: source },
    ])

    expect(mocks.batchAdd).toHaveBeenCalledWith({ DB: 'db' }, [
      { path: '/memo/note', renderer: 'markdown', content: source, private: true },
      { path: '/post/note', renderer: 'svelte', content: source, private: false },
    ])
  })

  it('normalizes File Path before deriving the Visibility Default and writing', async () => {
    mocks.batchAdd.mockResolvedValue([{ id: 1, path: '/memo/note', title: 'note', content: 'source' }])

    await batchImport.orThrow.call(context, [
      { path: '//memo//note', renderer: 'markdown', content: 'source' },
    ])

    expect(mocks.batchAdd).toHaveBeenCalledWith({ DB: 'db' }, [
      { path: '/memo/note', renderer: 'markdown', content: 'source', private: true },
    ])
  })

  it('rejects duplicate normalized File Paths before starting the Source batch write', async () => {
    await expect(batchImport.orThrow.call(context, [
      { path: '/wiki/note', renderer: 'markdown', content: 'Markdown' },
      { path: '//wiki//note', renderer: 'svelte', content: '<h1>Svelte</h1>' },
    ])).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(mocks.batchAdd).not.toHaveBeenCalled()
  })

  it('rejects extension-bearing and non-absolute File Paths before writing', async () => {
    const inputWithPrivate = { path: '/memo/note', renderer: 'markdown' as const, content: 'source', private: false }
    await expect(batchImport.orThrow.call(context, [
      { path: '/memo/note.svelte', renderer: 'svelte', content: 'source' },
    ])).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    await expect(batchImport.orThrow.call(context, [
      { path: 'memo/note', renderer: 'markdown', content: 'source' },
    ])).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    await expect(batchImport.orThrow.call(context, [
      inputWithPrivate,
    ])).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(mocks.batchAdd).not.toHaveBeenCalled()
  })
})
