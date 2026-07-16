import { MarkdownSource } from '@/db'
import { readArticle } from '@/lib/services/article'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ read: vi.fn() }))

vi.mock('@/db/markdown', () => ({ read: mocks.read }))

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
    mocks.read.mockResolvedValue({ id: 1, private: false })
  })

  it('maps legacy route parameters to canonical absolute Paths', async () => {
    const inject = appInject()

    await readArticle(inject, MarkdownSource.Post, 'hello')
    await readArticle(inject, MarkdownSource.Memo, 'project/note')
    await readArticle(inject, MarkdownSource.Memo, 'memos/legacy')

    expect(mocks.read).toHaveBeenNthCalledWith(1, { DB: 'db' }, MarkdownSource.Post, '/post/hello')
    expect(mocks.read).toHaveBeenNthCalledWith(2, { DB: 'db' }, MarkdownSource.Memo, '/memo/project/note')
    expect(mocks.read).toHaveBeenNthCalledWith(3, { DB: 'db' }, MarkdownSource.Memo, '/memos/legacy')
  })
})
