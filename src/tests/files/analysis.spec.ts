import { analyzeMarkdownSource } from '@/lib/files/analysis'
import { describe, expect, it } from 'vitest'

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
