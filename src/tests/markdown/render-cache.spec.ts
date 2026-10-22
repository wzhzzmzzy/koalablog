import { createHighlighterCore } from 'shiki/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CatppuccinTheme } from '@/lib/const/config'

vi.mock('shiki/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('shiki/core')>()
  return { ...actual, createHighlighterCore: vi.fn(actual.createHighlighterCore) }
})

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('markdown rendering cache', () => {
  it('shares one cold highlighter across concurrent requests, but not paths, metadata or themes', async () => {
    const { md } = await import('@/lib/markdown')
    const [first, second] = await Promise.all([
      md({ theme: CatppuccinTheme.Latte, allFilePaths: ['/private/first'] }),
      md({ theme: CatppuccinTheme.Mocha, allFilePaths: ['/private/second'] }),
    ])
    expect(createHighlighterCore).toHaveBeenCalledTimes(1)
    expect(first).not.toBe(second)
    const source = '[[/private/first]] [[/private/second]]\n\n```python\nprint(1)\n```'
    const firstHtml = first.render(`---\ntitle: First\n---\n${source}`)
    const secondHtml = second.render(`---\ntitle: Second\n---\n${source}`)
    expect(firstHtml).toContain('catppuccin-latte')
    expect(firstHtml).toContain('href="/private/first"')
    expect(firstHtml).not.toContain('href="/private/second"')
    expect(secondHtml).toContain('catppuccin-mocha')
    expect(secondHtml).toContain('href="/private/second"')
    expect(secondHtml).not.toContain('href="/private/first"')
    expect(first.meta).toEqual({ title: 'First' })
    expect(second.meta).toEqual({ title: 'Second' })
    expect(first.render(source)).toContain('catppuccin-latte')
    expect(first.meta).toBeUndefined()
    expect(second.meta).toEqual({ title: 'Second' })
    await md({ themeConfig: { light: CatppuccinTheme.Frappe, dark: CatppuccinTheme.Macchiato } })
    expect(createHighlighterCore).toHaveBeenCalledTimes(1)
  })

  it('loads later browser languages and themes into the same bounded highlighter', async () => {
    vi.stubEnv('SSR', false)
    const dataset = { lightTheme: 'latte', darkTheme: 'mocha' }
    vi.stubGlobal('window', {
      document: { querySelector: () => ({ dataset }) },
      matchMedia: () => ({ matches: false }),
    })
    const { md } = await import('@/lib/markdown')
    const first = await md({ langSet: ['py'] })
    const highlighter = await vi.mocked(createHighlighterCore).mock.results[0].value
    expect(highlighter.getLoadedLanguages()).toContain('python')
    expect(highlighter.getLoadedLanguages()).not.toContain('json')
    dataset.lightTheme = 'frappe'
    const [second, third] = await Promise.all([md({ langSet: ['json'] }), md({ langSet: ['json'] })])
    expect(createHighlighterCore).toHaveBeenCalledTimes(1)
    expect(highlighter.getLoadedLanguages()).toContain('json')
    expect(highlighter.getLoadedThemes()).toEqual(expect.arrayContaining(['catppuccin-latte', 'catppuccin-mocha', 'catppuccin-frappe']))
    expect(second.render('```json\n{}\n```')).toContain('catppuccin-frappe')
    expect(third.render('```json\n{}\n```')).toContain('code-lang')
    expect(first.render('```py\nprint(1)\n```')).toContain('catppuccin-latte')
  })

  it('allows a later request to retry failed initialization', async () => {
    vi.mocked(createHighlighterCore).mockRejectedValueOnce(new Error('temporary initialization failure'))
    const { md } = await import('@/lib/markdown')
    const results = await Promise.allSettled([md(), md()])
    expect(results.map(result => result.status)).toEqual(['rejected', 'rejected'])
    expect(createHighlighterCore).toHaveBeenCalledTimes(1)
    const renderer = await md()
    expect(renderer.render('```js\nconst value = 1\n```')).toContain('catppuccin-latte')
    expect(createHighlighterCore).toHaveBeenCalledTimes(2)
  })

  it('keeps raw parser options and state local and resets languages on every render', async () => {
    const { rawMd } = await import('@/lib/markdown')
    const first = rawMd({ tex: false, allFilePaths: ['/private/first'] })
    const second = rawMd({ tex: true, allFilePaths: ['/private/second'] })
    expect(first).not.toBe(second)
    expect(first.render('$x$\n\n```python\nprint(1)\n```')).not.toContain('<math')
    expect(first.renderLangSet).toEqual(new Set(['python']))
    expect(second.render('$x$ [[/private/first]] [[/private/second]]')).toContain('<math')
    expect(second.renderLangSet).toEqual(new Set())
    const source = '---\ntitle: First\n---\n[[/private/first]] [[/private/second]]'
    const html = first.render(source)
    expect(html).toContain('href="/private/first"')
    expect(html).not.toContain('href="/private/second"')
    expect(first.renderLangSet).toEqual(new Set())
    expect(first.meta).toEqual({ title: 'First' })
    expect(rawMd({ meta: false }).render(source)).toContain('title: First')
    expect(createHighlighterCore).not.toHaveBeenCalled()
  })
})
