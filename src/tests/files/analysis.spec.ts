import { describe, expect, it } from 'vitest'
import { analyzeMarkdownSource, prepareMarkdownSource } from '@/lib/files/analysis'

describe('markdown Source analysis', () => {
  it('collects canonical absolute File References and tags in first-seen order', () => {
    expect(analyzeMarkdownSource(`
#first [[/project//计划]]
#第二 [[/project/计划]] [[/wiki/入口]] #first
`)).toEqual({
      tags: ['first', '第二'],
      outgoingPaths: ['/project/计划', '/wiki/入口'],
    })
  })

  it('ignores relative, title-only, malformed, and ordinary Markdown links', () => {
    expect(analyzeMarkdownSource(`
[[Title]] [[relative/path]] [[/valid/path]] [[unfinished
[ordinary](/not-a-file-reference)
`)).toEqual({
      tags: [],
      outgoingPaths: ['/valid/path'],
    })
  })

  it('does not analyze fenced code, inline code, or escaped syntax', () => {
    expect(analyzeMarkdownSource(`
\`[[/inline/code]] #inline\`

\`\`\`md
[[/fenced/code]] #fenced
\`\`\`

\\[[/escaped/reference]] \\#escaped
[[/visible/reference]] #visible
`)).toEqual({
      tags: ['visible'],
      outgoingPaths: ['/visible/reference'],
    })
  })

  it('preserves Unicode tags and rejects renderer-extension references', () => {
    expect(analyzeMarkdownSource('#测试 #🏷️ [[/页面/入口]] [[/页面/source.md]]')).toEqual({
      tags: ['测试', '🏷️'],
      outgoingPaths: ['/页面/入口'],
    })
  })
})

describe('markdown Source preparation', () => {
  it('leaves untagged Source byte-identical', () => {
    const source = 'No tags here.\n'
    expect(prepareMarkdownSource(source)).toEqual({
      content: source,
      tags: [],
      outgoingPaths: [],
      warnings: [],
    })
  })

  it('adds canonical frontmatter for body tags', () => {
    expect(prepareMarkdownSource('Hello #one and #two')).toEqual({
      content: '---\ntags: ["one", "two"]\n---\n\nHello #one and #two',
      tags: ['one', 'two'],
      outgoingPaths: [],
      warnings: [],
    })
  })

  it('retains frontmatter-only tags and appends first-seen body tags', () => {
    const result = prepareMarkdownSource([
      '---',
      'title: "Tag notes"',
      'tags:',
      '  - Existing',
      '  - comma,tag',
      '---',
      '',
      '> #Existing #body_tag',
      '',
      '- #Body-tag #body_tag #existing',
    ].join('\n'))

    expect(result.tags).toEqual(['Existing', 'comma,tag', 'body_tag', 'Body-tag', 'existing'])
    expect(result.content).toContain('tags: ["Existing", "comma,tag", "body_tag", "Body-tag", "existing"]')
    expect(result.content).toContain('title: "Tag notes"')
  })

  it('reads and upgrades scalar legacy CSV tags when reconciliation changes them', () => {
    const result = prepareMarkdownSource('---\ntags: "one,two"\n---\n\n#three')
    expect(result.tags).toEqual(['one', 'two', 'three'])
    expect(result.content).toBe('---\ntags: ["one", "two", "three"]\n---\n\n#three')
  })

  it('supports JSON-sensitive tag characters in canonical YAML', () => {
    const result = prepareMarkdownSource('#quote"tag #back\\slash #测试 #🏷️')
    expect(result.tags).toEqual(['quote"tag', 'back\\slash', '测试', '🏷️'])
    expect(prepareMarkdownSource(result.content)).toEqual(result)
  })

  it('ignores frontmatter hashes, code, links, headings, and escaped syntax', () => {
    const result = prepareMarkdownSource([
      '---',
      'title: "#not-body"',
      '---',
      '',
      '# Heading',
      '',
      '`#inline` [#linked](/path) \\#escaped #visible',
      '',
      '```md',
      '#fenced',
      '```',
    ].join('\n'))

    expect(result.tags).toEqual(['visible'])
  })

  it('keeps body-derived tags and references when frontmatter cannot be rewritten', () => {
    const source = '---\ntags: [one, 2]\n---\n\n#body [[/wiki/start]]'
    expect(prepareMarkdownSource(source)).toEqual({
      content: source,
      tags: ['body'],
      outgoingPaths: ['/wiki/start'],
      warnings: [{
        code: 'unsupported-tags',
        message: 'The frontmatter tags field is not a string or string array, so it was not changed.',
      }],
    })
  })

  it('is idempotent after reconciling existing frontmatter', () => {
    const once = prepareMarkdownSource('---\ntags:\n  - front\n---\n\n#body [[/one]]')
    expect(prepareMarkdownSource(once.content)).toEqual(once)
  })

  it('preserves an existing tags field until Effective Tags change', () => {
    const block = '---\ntags:\n  - front\n---\n\nNo body tags.'
    const csv = '---\ntags: "one,two"\n---\n\n#one #two'

    expect(prepareMarkdownSource(block).content).toBe(block)
    expect(prepareMarkdownSource(csv).content).toBe(csv)
  })

  it('appends tags to frontmatter without a tags field', () => {
    expect(prepareMarkdownSource('---\ntitle: Notes\n---\n\n#body').content).toBe(
      '---\ntitle: Notes\ntags: ["body"]\n---\n\n#body',
    )
  })

  it('de-duplicates repeated frontmatter tags exactly', () => {
    const result = prepareMarkdownSource('---\ntags: [same, same, Same]\n---\n\nBody')
    expect(result.tags).toEqual(['same', 'Same'])
    expect(result.content).toContain('tags: ["same", "Same"]')
  })
})
