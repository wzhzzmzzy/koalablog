import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import { parse } from 'node-html-parser'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import List from '@/components/dashboard/list.astro'
import { MarkdownSource } from '@/db'
import { readList } from '@/db/markdown'
import { makeFileRecord } from '@/tests/fixtures/file-record'

vi.mock('@/db/markdown', () => ({ readList: vi.fn() }))

beforeEach(() => vi.resetAllMocks())

describe.each([MarkdownSource.Post, MarkdownSource.Memo])('file list for Source %s', (source) => {
  it('shows Svelte briefs as plain text and preserves Markdown listing behavior', async () => {
    const brief = 'Plan A & B with <img src=x onerror="alert(1)"> and {count}.'
    vi.mocked(readList).mockResolvedValue([
      {
        ...makeFileRecord({
          source,
          path: '/page/app',
          renderer: 'svelte',
          content: `<!-- @brief: ${brief} --><script>const sourceOnly = 1</script><p>Template body</p>`,
        }),
        userId: 7,
      },
      {
        ...makeFileRecord({ source, path: '/page/legacy', renderer: 'svelte', content: '<script>const legacySource = 1</script><h1>Legacy markup</h1>' }),
        userId: 7,
      },
      {
        ...makeFileRecord({ source, path: '/page/markdown', content: 'First **paragraph**.\n\nSecond paragraph.' }),
        userId: 7,
      },
    ])

    const container = await AstroContainer.create()
    const html = await container.renderToString(List, { props: { source }, locals: {} })
    const list = parse(html)
    expect(list.querySelector('a[href="/page/app"]')!.parentNode.querySelector('p')!.text).toBe(brief)
    expect(list.querySelector('img')).toBeNull()
    expect(list.querySelector('a[href="/page/legacy"]')!.parentNode.querySelector('p')).toBeNull()
    expect(html).not.toMatch(/sourceOnly|legacySource|Template body|Legacy markup|@brief/)
    const markdownPreview = list.querySelector('a[href="/page/markdown"]')!.parentNode.querySelector('p')
    if (source === MarkdownSource.Memo)
      expect(markdownPreview!.text).toBe('First paragraph.\nSecond paragraph.')
    else
      expect(markdownPreview).toBeNull()
  })
})
