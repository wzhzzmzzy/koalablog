import type { APIContext } from 'astro'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MarkdownSource } from '@/db'
import { readActivePaths, readAllPublic } from '@/db/markdown'
import { GET } from '@/pages/rss.xml'
import { makeFileRecord } from '@/tests/fixtures/file-record'

vi.mock('@/db/markdown', () => ({
  readAllPublic: vi.fn(),
  readActivePaths: vi.fn(),
}))

function context(userId?: number): APIContext {
  return {
    url: new URL('https://example.com/rss.xml'),
    locals: {
      config: { pageConfig: { title: 'Test blog' } },
      session: { userId },
    },
  } as APIContext
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(readActivePaths).mockResolvedValue([])
})

describe('rss endpoint', () => {
  it.each([undefined, 7])('excludes /data Files from the feed for viewer %s', async (userId) => {
    const visiblePaths = ['/post/article', '/memo/note', '/database', '/data-notes/item', '/post/data/item']
    const files = [
      ...visiblePaths.map(path => ({
        ...makeFileRecord({ path, title: path.split('/').at(-1)!, content: `Visible body for ${path}` }),
        userId: 7,
      })),
      ...['/data', '/data/state', '/data/nested/state'].map(path => ({
        ...makeFileRecord({ path, title: 'Excluded title', content: 'Excluded Markdown body' }),
        userId: 7,
      })),
      {
        ...makeFileRecord({
          path: '/data/app',
          title: 'Excluded app',
          source: MarkdownSource.Post,
          renderer: 'svelte',
          content: '<h1>Excluded Svelte source</h1>',
        }),
        userId: 7,
      },
    ]
    vi.mocked(readAllPublic).mockResolvedValue(files)
    vi.mocked(readActivePaths).mockResolvedValue(files.map(file => file.path))

    const response = await GET(context(userId))
    const body = await response.text()

    expect(response.status).toBe(200)
    expect(body.match(/<item>/g)).toHaveLength(visiblePaths.length)
    for (const path of visiblePaths) {
      expect(body).toContain(`<link>https://example.com${path}/</link>`)
      expect(body).toContain(`Visible body for ${path}`)
    }
    expect(body).not.toContain('Excluded')
    expect(body).not.toMatch(/<link>https:\/\/example\.com\/data(?:\/|<)/)
  })

  it('returns an empty feed when all public Files are under /data', async () => {
    vi.mocked(readAllPublic).mockResolvedValue([
      { ...makeFileRecord({ path: '/data/state', content: 'Excluded body' }), userId: 7 },
    ])

    const response = await GET(context())
    const body = await response.text()

    expect(response.status).toBe(200)
    expect(body).toContain('<title>Test blog</title>')
    expect(body).not.toContain('<item>')
    expect(body).not.toContain('Excluded body')
  })
})
