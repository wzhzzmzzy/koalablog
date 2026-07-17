import { batchImport } from '@/actions/db/markdown'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  authGuard: vi.fn(),
  batchAdd: vi.fn(),
}))

vi.mock('@/actions/utils/auth', () => ({ authGuard: mocks.authGuard }))
vi.mock('@/db/markdown', () => ({ batchAdd: mocks.batchAdd }))

const context = { locals: { runtime: { env: { DB: 'db' } }, session: { role: 'admin' } } } as any

describe('markdown disk import action', () => {
  beforeEach(() => vi.clearAllMocks())

  it('preserves Source verbatim and applies Visibility Default from the absolute Path', async () => {
    const source = '---\ncustom: user-owned\n---\n\nBody'
    mocks.batchAdd.mockResolvedValue([{ id: 1, path: '/memo/note', title: 'note', content: source }])

    await batchImport.orThrow.call(context, [
      { path: '/memo/note', content: source },
      { path: '/post/note', content: source },
    ])

    expect(mocks.batchAdd).toHaveBeenCalledWith({ DB: 'db' }, [
      { path: '/memo/note', content: source, private: true },
      { path: '/post/note', content: source, private: false },
    ])
  })

  it('normalizes File Path before deriving the Visibility Default and writing', async () => {
    mocks.batchAdd.mockResolvedValue([{ id: 1, path: '/memo/note', title: 'note', content: 'source' }])

    await batchImport.orThrow.call(context, [
      { path: '//memo//note', content: 'source' },
    ])

    expect(mocks.batchAdd).toHaveBeenCalledWith({ DB: 'db' }, [
      { path: '/memo/note', content: 'source', private: true },
    ])
  })

  it('rejects extension-bearing and non-absolute File Paths before writing', async () => {
    await expect(batchImport.orThrow.call(context, [
      { path: '/memo/note.svelte', content: 'source' },
    ])).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    await expect(batchImport.orThrow.call(context, [
      { path: 'memo/note', content: 'source' },
    ])).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    await expect(batchImport.orThrow.call(context, [
      { path: '/memo/note', content: 'source', private: false },
    ])).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(mocks.batchAdd).not.toHaveBeenCalled()
  })
})
