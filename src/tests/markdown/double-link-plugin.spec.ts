import type { DoubleLinkPluginOptions } from '@/lib/markdown/double-link-plugin'
import { useDoubleLink } from '@/lib/markdown/double-link-plugin'
import MarkdownIt from 'markdown-it'
import { describe, expect, it } from 'vitest'

describe('double-link-plugin', () => {
  const createMd = (options?: DoubleLinkPluginOptions) => {
    const md = new MarkdownIt()
    useDoubleLink(md, options)
    return md
  }

  it('renders an existing absolute File Reference', () => {
    const result = createMd({ allFilePaths: ['/post/existing-post'] }).render('[[/post/existing-post]]')

    expect(result).toContain('href="/post/existing-post"')
    expect(result).toContain('data-path="/post/existing-post"')
    expect(result).toContain('>/post/existing-post</a>')
  })

  it('canonicalizes an absolute File Reference before resolution', () => {
    const result = createMd({ allFilePaths: ['/wiki/entry'] }).render('[[/wiki//entry]]')

    expect(result).toContain('href="/wiki/entry"')
    expect(result).toContain('>/wiki//entry</a>')
  })

  it('never resolves Title or relative shorthand', () => {
    const md = createMd({ allFilePaths: ['/post/existing-post'] })

    expect(md.render('[[Existing Post]]')).not.toContain('href=')
    expect(md.render('[[post/existing-post]]')).not.toContain('href=')
  })

  it('marks a missing absolute Path as unresolved', () => {
    const result = createMd({ allFilePaths: [] }).render('[[/missing]]')

    expect(result).not.toContain('href=')
    expect(result).not.toContain('data-path=')
    expect(result).toContain('>/missing</a>')
  })

  it('does not parse incomplete, empty, or single-bracket syntax', () => {
    const md = createMd()

    expect(md.render('[[incomplete')).not.toContain('<a')
    expect(md.render('[[]]')).not.toContain('<a')
    expect(md.render('[single]')).not.toContain('outgoing-link')
  })

  it('supports presentation options without changing Path resolution', () => {
    const result = createMd({
      allFilePaths: ['/self'],
      className: 'custom-link',
      target: '_self',
    }).render('[[/self]]')

    expect(result).toContain('class="custom-link"')
    expect(result).toContain('target="_self"')
  })

  it('renders multiple absolute references alongside Markdown', () => {
    const result = createMd({ allFilePaths: ['/first', '/second'] })
      .render('**Files:** [[/first]] and [[/second]].')

    expect(result).toContain('<strong>Files:</strong>')
    expect(result).toContain('href="/first"')
    expect(result).toContain('href="/second"')
  })

  it('escapes reference text and attributes', () => {
    const result = createMd().render('[[/<script>alert("xss")</script>]]')

    expect(result).toContain('&lt;script&gt;')
    expect(result).not.toContain('<script>')
  })

  it('preserves Unicode absolute Paths', () => {
    const result = createMd({ allFilePaths: ['/页面/入口'] }).render('[[/页面/入口]]')

    expect(result).toContain('href="/页面/入口"')
  })
})
