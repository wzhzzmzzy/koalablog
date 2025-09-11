import { useMetaPlugin } from '@/lib/markdown/meta-plugin'
import MarkdownIt from 'markdown-it'
import { describe, expect, it } from 'vitest'

describe('meta-plugin', () => {
  it('should parse basic frontmatter with string values', () => {
    const md = MarkdownIt()
    useMetaPlugin(md)

    const content = `---
title: "Hello World"
author: "John Doe"
---

# Content here`

    const result = md.render(content)

    expect((md as any).meta).toEqual({
      title: 'Hello World',
      author: 'John Doe',
    })
    expect(result).toContain('<h1>Content here</h1>')
  })

  it('should parse boolean and null values', () => {
    const md = MarkdownIt()
    useMetaPlugin(md)

    const content = `---
published: true
draft: false
tags: null
---

Content`

    md.render(content)

    expect((md as any).meta).toEqual({
      published: true,
      draft: false,
      tags: null,
    })
  })

  it('should parse the export format from io.ts', () => {
    const md = MarkdownIt()
    useMetaPlugin(md)

    const content = `---
link: "post/example"
tags: "tag1,tag2"
createdAt: "2024-01-01T00:00:00.000Z"
updatedAt: "2024-01-01T00:00:00.000Z"
deleted: false
---

# My Post

This is the content.`

    const result = md.render(content)

    expect((md as any).meta).toEqual({
      link: 'post/example',
      tags: 'tag1,tag2',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      deleted: false,
    })

    expect(result).toContain('<h1>My Post</h1>')
    expect(result).toContain('<p>This is the content.</p>')
  })

  it('should handle content without frontmatter', () => {
    const md = MarkdownIt()
    useMetaPlugin(md)

    const content = `# Regular Markdown

No frontmatter here.`

    const result = md.render(content)

    expect((md as any).meta).toBeUndefined()
    expect(result).toContain('<h1>Regular Markdown</h1>')
  })

  it('should handle empty frontmatter', () => {
    const md = MarkdownIt()
    useMetaPlugin(md)

    const content = `---
---

# Content`

    const result = md.render(content)

    expect((md as any).meta).toEqual({})
    expect(result).toContain('<h1>Content</h1>')
  })

  it('should handle values without quotes', () => {
    const md = MarkdownIt()
    useMetaPlugin(md)

    const content = `---
title: Hello World
count: 42
enabled: true
---

Content`

    md.render(content)

    expect((md as any).meta).toEqual({
      title: 'Hello World',
      count: '42',
      enabled: true,
    })
  })

  it('should handle single quotes', () => {
    const md = MarkdownIt()
    useMetaPlugin(md)

    const content = `---
title: 'Single quoted'
description: "Double quoted"
---

Content`

    md.render(content)

    expect((md as any).meta).toEqual({
      title: 'Single quoted',
      description: 'Double quoted',
    })
  })
})
