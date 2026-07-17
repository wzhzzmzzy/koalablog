import { MarkdownSource } from '@/db'
import { readArticle } from '@/lib/services/article'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ readByPath: vi.fn() }))

vi.mock('@/db/markdown', () => ({ readByPath: mocks.readByPath }))

function appInject() {
  return {
    locals: {
      runtime: { env: { DB: 'db' } },
      session: { role: 'admin' },
    },
    redirect: vi.fn((path: string) => new Response(null, { status: 302, headers: { Location: path } })),
    url: new URL('https://koala.test/post/hello'),
  } as any
}

describe('public File route lookup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.readByPath.mockResolvedValue({ id: 1, private: false })
  })

  it('maps legacy route parameters to canonical absolute Paths', async () => {
    const inject = appInject()

    await readArticle(inject, MarkdownSource.Post, 'hello')
    await readArticle(inject, MarkdownSource.Memo, 'project/note')
    await readArticle(inject, MarkdownSource.Memo, 'memos/legacy')

    expect(mocks.readByPath).toHaveBeenNthCalledWith(1, { DB: 'db' }, '/post/hello')
    expect(mocks.readByPath).toHaveBeenNthCalledWith(2, { DB: 'db' }, '/memo/project/note')
    expect(mocks.readByPath).toHaveBeenNthCalledWith(3, { DB: 'db' }, '/memos/legacy')
  })
})
