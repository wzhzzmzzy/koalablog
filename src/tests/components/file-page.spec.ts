import FilePage from '@/components/article-view/FilePage.astro'
import { MarkdownSource } from '@/db'
import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  readActivePaths: vi.fn(),
  readArtifactAccess: vi.fn(),
  renderIt: vi.fn(),
}))

vi.mock('@/db/markdown', () => ({
  readActivePaths: mocks.readActivePaths,
}))

vi.mock('@/lib/markdown/render-it', () => ({
  renderIt: mocks.renderIt,
}))

vi.mock('@/db/render-artifact', () => ({
  readArtifactAccess: mocks.readArtifactAccess,
}))

function article(overrides: Record<string, unknown> = {}) {
  return {
    content: '# Koala',
    createdAt: new Date('2026-07-24T00:00:00Z'),
    deletedAt: null,
    id: 7,
    incoming_links: null,
    outgoing_links: null,
    path: '/page/koala',
    private: false,
    remoteTruth: false,
    renderer: 'markdown' as const,
    revision: 1,
    source: MarkdownSource.Page,
    sourceHash: 'a'.repeat(64),
    tags: null,
    title: 'koala',
    updatedAt: new Date('2026-07-24T00:00:00Z'),
    ...overrides,
  } as any
}

function locals() {
  return {
    config: {
      font: {},
      pageConfig: { theme: 'light', title: 'KoalaBlog' },
    },
    runtime: { env: { DB: 'db' } },
  } as any
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.readActivePaths.mockResolvedValue(['/page/koala'])
  mocks.renderIt.mockResolvedValue({
    content: '<p>Summary</p><h2 id="body">Body</h2>',
    renderLangSet: new Set(),
  })
  mocks.readArtifactAccess.mockResolvedValue({
    artifact: {
      snapshotHtml: '<p>Svelte summary</p><a href="/safe">Safe</a>',
    },
    decision: { cacheControl: 'public, no-cache', status: 200, type: 'allowed' },
  })
})

describe('shared File page shell', () => {
  it('keeps Page, Post, Memo, and legacy Memo Markdown output on one deterministic shell', async () => {
    const container = await AstroContainer.create()
    const matrix = [
      { expectedTitle: 'koala', source: MarkdownSource.Page },
      { expectedTitle: 'Post title', source: MarkdownSource.Post, title: 'post-path-title' },
      { expectedTitle: 'koala', source: MarkdownSource.Memo },
      { expectedTitle: 'koala', path: '/memos/koala', source: MarkdownSource.Memo },
    ]

    for (const entry of matrix) {
      const html = await container.renderToString(FilePage, {
        locals: locals(),
        props: {
          article: article(entry),
          title: entry.expectedTitle === 'Post title' ? entry.expectedTitle : undefined,
        },
        request: new Request('https://koala.test/example'),
      })

      expect(html).toContain('<meta name="description" content="Summary">')
      expect(html).toMatch(/<article id="article"[^>]*><p>Summary<\/p><h2 id="body">Body<\/h2><\/article>/)
      expect(html).toContain(`<title>${entry.expectedTitle}</title>`)
    }

    expect(mocks.readActivePaths).toHaveBeenCalledTimes(matrix.length)
    expect(mocks.renderIt).toHaveBeenCalledTimes(matrix.length)
  })

  it('renders a current Svelte Artifact as styled Snapshot without reading Markdown Source', async () => {
    const container = await AstroContainer.create()
    const response = await container.renderToResponse(FilePage, {
      locals: locals(),
      props: { article: article({ content: '<script>secret()</script>', renderer: 'svelte' }) },
      request: new Request('https://koala.test/page/koala'),
    })
    const html = await response.text()

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('public, no-cache')
    expect(html).toContain('<title>koala</title>')
    expect(html).toContain('href="/api/render-artifacts/7/')
    expect(html).toContain('data-koala-artifact-root')
    expect(html).toContain('<p>Svelte summary</p><a href="/safe">Safe</a>')
    expect(html).not.toContain('secret()')
    expect(mocks.renderIt).not.toHaveBeenCalled()
  })

  it('returns an uncached 503 shell instead of stale Svelte output', async () => {
    mocks.readArtifactAccess.mockResolvedValue({
      decision: { cacheControl: 'no-store', status: 503, type: 'artifact_unavailable' },
    })
    const container = await AstroContainer.create()
    const response = await container.renderToResponse(FilePage, {
      locals: locals(),
      props: { article: article({ content: '<p>Source must stay hidden</p>', renderer: 'svelte' }) },
      request: new Request('https://koala.test/page/koala'),
    })
    const html = await response.text()

    expect(response.status).toBe(503)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(html).toContain('Unable to render this page right now.')
    expect(html).not.toContain('Source must stay hidden')
  })
})
