import { describe, expect, it } from 'vitest'
import { parseLeadingFrontmatter } from '@/lib/markdown/frontmatter'

describe('leading Markdown frontmatter', () => {
  it('distinguishes absent frontmatter and leaves Source unchanged', () => {
    const source = '# Body'
    const result = parseLeadingFrontmatter(source)

    expect(result).toMatchObject({ status: 'absent', body: source, bodyStart: 0 })
    expect(result.replaceTags([])).toBe(source)
  })

  it('parses YAML metadata while keeping number compatibility', () => {
    const result = parseLeadingFrontmatter('---\ntitle: Hello\ncount: 42\nenabled: true\ntags: [one, two]\n---\n\nBody')

    expect(result).toMatchObject({
      status: 'valid',
      body: 'Body',
      meta: { title: 'Hello', count: '42', enabled: true, tags: ['one', 'two'] },
      tags: ['one', 'two'],
    })
  })

  it('preserves unrelated bytes when replacing a tags field', () => {
    const source = [
      '---',
      '# retained comment',
      'title: "A # title"',
      'tags:',
      '  - existing',
      '  - old # field comment may be normalized',
      '# comment belonging to next',
      'draft: false',
      '---',
      '',
      'Body',
    ].join('\n')

    expect(parseLeadingFrontmatter(source).replaceTags(['existing', 'body-tag'])).toBe([
      '---',
      '# retained comment',
      'title: "A # title"',
      'tags: ["existing", "body-tag"]',
      '# comment belonging to next',
      'draft: false',
      '---',
      '',
      'Body',
    ].join('\n'))
  })

  it('appends tags to existing empty frontmatter', () => {
    expect(parseLeadingFrontmatter('---\n---\n\nBody').replaceTags(['body'])).toBe(
      '---\ntags: ["body"]\n---\n\nBody',
    )
  })

  it('returns the body but refuses to rewrite invalid frontmatter', () => {
    const source = '---\ntitle: [unterminated\n---\n\n#body'
    const result = parseLeadingFrontmatter(source)

    expect(result).toMatchObject({
      status: 'invalid',
      body: '#body',
      warning: 'invalid-frontmatter',
    })
    expect(result.replaceTags(['body'])).toBe(source)
  })

  it('refuses to rewrite duplicate or unsupported tags fields', () => {
    const duplicate = parseLeadingFrontmatter('---\ntags: one\ntags: two\n---\n#body')
    expect(duplicate).toMatchObject({ status: 'ambiguous', warning: 'ambiguous-tags' })

    const unsupported = parseLeadingFrontmatter('---\ntags: [one, 2]\n---\n#body')
    expect(unsupported).toMatchObject({ status: 'ambiguous', warning: 'unsupported-tags' })
  })

  it('treats custom YAML tags as invalid data rather than resolving them', () => {
    const source = '---\ntitle: !custom value\n---\n\nBody'
    const result = parseLeadingFrontmatter(source)

    expect(result).toMatchObject({ status: 'invalid', body: 'Body' })
    expect(result.replaceTags(['safe'])).toBe(source)
  })

  it('preserves CRLF when changing existing frontmatter', () => {
    const source = '---\r\ntitle: CRLF\r\n---\r\n\r\n#body'
    expect(parseLeadingFrontmatter(source).replaceTags(['body'])).toBe(
      '---\r\ntitle: CRLF\r\ntags: ["body"]\r\n---\r\n\r\n#body',
    )
  })
})
