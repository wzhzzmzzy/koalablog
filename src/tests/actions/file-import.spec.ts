import { beforeEach, describe, expect, it, vi } from 'vitest'
import { batchImport } from '@/actions/db/markdown'

const mocks = vi.hoisted(() => ({
  authGuard: vi.fn(),
  batchAdd: vi.fn(),
}))

vi.mock('@/actions/utils/auth', () => ({ authGuard: mocks.authGuard }))
vi.mock('@/db/markdown', () => ({ batchAdd: mocks.batchAdd }))

const context = { locals: { runtime: { env: { DB: 'db' } }, session: { userId: 1, role: 'admin' } } } as any

describe('file disk import action', () => {
  beforeEach(() => vi.clearAllMocks())

  it('preserves Renderer and Source verbatim while making imported Files private', async () => {
    const source = '---\ncustom: user-owned\n---\n\nBody'
    mocks.batchAdd.mockResolvedValue([{ id: 1, path: '/memo/note', title: 'note', content: source }])

    await batchImport.orThrow.call(context, [
      { path: '/memo/note', renderer: 'markdown', content: source },
      { path: '/post/note', renderer: 'svelte', content: source },
    ])

    expect(mocks.batchAdd).toHaveBeenCalledWith({ DB: 'db' }, [
      { path: '/memo/note', renderer: 'markdown', content: source, private: true, userId: 1 },
      { path: '/post/note', renderer: 'svelte', content: source, private: true, userId: 1 },
    ])
  })

  it('normalizes File Path before writing a private imported File', async () => {
    mocks.batchAdd.mockResolvedValue([{ id: 1, path: '/memo/note', title: 'note', content: 'source' }])

    await batchImport.orThrow.call(context, [
      { path: '//memo//note', renderer: 'markdown', content: 'source' },
    ])

    expect(mocks.batchAdd).toHaveBeenCalledWith({ DB: 'db' }, [
      { path: '/memo/note', renderer: 'markdown', content: 'source', private: true, userId: 1 },
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
