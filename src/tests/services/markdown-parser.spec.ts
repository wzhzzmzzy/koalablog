import { parseMarkdownContent } from '@/lib/services/markdown-parser'
import { describe, expect, it } from 'vitest'

describe('markdown-parser', () => {
  it('should parse markdown with meta frontmatter', async () => {
    const content = `---
title: "Test Post"
tags: "tag1,tag2"
---

# Hello World

This is a test post.`

    const result = await parseMarkdownContent(content, { includeMeta: true })

    expect(result.error).toBeUndefined()
    expect(result.meta).toEqual({
      title: 'Test Post',
      tags: 'tag1,tag2',
    })
    expect(result.html).toContain('<h1>Hello World</h1>')
  })

  it('should parse content without frontmatter', async () => {
    const content = `# Regular Markdown

No frontmatter here. #tag [[/wiki/entry]] [[Title]]`

    const result = await parseMarkdownContent(content, { includeMeta: true })

    expect(result.outgoingPaths).toEqual(['/wiki/entry'])
    expect(result.tags).toEqual(['tag'])
  })
})
