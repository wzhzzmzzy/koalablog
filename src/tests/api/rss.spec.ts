import type { APIContext } from 'astro'
import { parse } from 'node-html-parser'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MarkdownSource } from '@/db'
import { readActivePaths, readAllPublic } from '@/db/markdown'
import { parseAbsoluteFilePath } from '@/lib/files/path'
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
          content: '<!-- @brief: Excluded brief. --><h1>Excluded Svelte source</h1>',
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
      expect(body).toContain(`<link>https://example.com${path}</link>`)
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

  it('publishes the Svelte brief as escaped text in both RSS summary fields', async () => {
    const brief = 'Compare A & B, <img src=x onerror="alert(1)">, **text** and {count}.'
    vi.mocked(readAllPublic).mockResolvedValue([{
      ...makeFileRecord({
        renderer: 'svelte',
        content: `<!-- @brief: ${brief} -->\n<script>const sourceOnly = 1</script><style>.sourceStyle { color: red; }</style><h1>Template body</h1>`,
      }),
      userId: 7,
    }])

    const body = await (await GET(context())).text()
    const item = parse(body).querySelector('item')!
    const description = item.querySelector('description')!.text
    const content = item.querySelector('content\\:encoded')!.text

    expect(parse(description).text).toBe(brief)
    expect(parse(content).querySelector('p')!.text).toBe(brief)
    expect(parse(description).querySelector('img')).toBeNull()
    expect(parse(content).querySelector('img')).toBeNull()
    expect(body).not.toMatch(/sourceOnly|sourceStyle|Template body|@brief/)
  })

  it.each(['', '<!-- @brief: \n -->'])('keeps Svelte title and link without leaking Source when brief is absent: %s', async (header) => {
    vi.mocked(readAllPublic).mockResolvedValue([{
      ...makeFileRecord({
        path: '/app',
        title: 'Interactive app',
        renderer: 'svelte',
        content: `${header}<script>const sourceOnly = 1</script><h1>Template body</h1>`,
      }),
      userId: 7,
    }])

    const body = await (await GET(context())).text()
    expect(body).toContain('<title>Interactive app</title>')
    expect(body).toContain('<link>https://example.com/app</link>')
    expect(body).not.toMatch(/sourceOnly|Template body|@brief/)
    const item = parse(body).querySelector('item')!
    expect(item.querySelector('description')?.text || '').toBe('')
    expect(item.querySelector('content\\:encoded')?.text || '').toBe('')
  })

  it('preserves Markdown summaries, full content, display titles and categories', async () => {
    vi.mocked(readAllPublic).mockResolvedValue([{
      ...makeFileRecord({
        source: MarkdownSource.Post,
        content: '---\ntitle: Markdown title\n---\n\nFirst **paragraph**.\n\nSecond paragraph.',
        tags: '["tag-one","tag-two"]',
      }),
      userId: 7,
    }])

    const item = parse(await (await GET(context())).text()).querySelector('item')!
    expect(item.querySelector('title')!.text).toBe('Markdown title')
    expect(item.querySelector('description')!.text).toBe('First <strong>paragraph</strong>.')
    expect(item.querySelector('content\\:encoded')!.text).toContain('<p>Second paragraph.</p>')
    expect(item.querySelectorAll('category').map(category => category.text)).toEqual(['tag-one', 'tag-two'])
  })

  it('keeps item links and permalink GUIDs at the exact valid File Paths', async () => {
    const files = [
      { ...makeFileRecord({ path: '/post/article', content: 'Article body' }), userId: 7 },
      { ...makeFileRecord({ path: '/news-feed', renderer: 'svelte', content: '<!-- @brief: Daily news. -->' }), userId: 7 },
    ]
    vi.mocked(readAllPublic).mockResolvedValue(files)

    const body = await (await GET(context())).text()
    const items = body.match(/<item>[\s\S]*?<\/item>/g)!
    expect(items).toHaveLength(files.length)
    items.forEach((item, index) => {
      const url = new URL(/<link>([^<]*)<\/link>/.exec(item)![1])
      expect(url.href).toBe(`https://example.com${files[index].path}`)
      expect(parseAbsoluteFilePath(url.pathname)).toEqual({ ok: true, value: files[index].path })
      expect(item).toContain(`<guid isPermaLink="true">${url.href}</guid>`)
    })
  })
})
