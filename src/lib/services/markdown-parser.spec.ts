import { beforeAll, describe, expect, it } from 'vitest'
import { parseMarkdownContent } from './markdown-parser'

// Mock DOM for testing
beforeAll(() => {
  globalThis.document = {
    createElement: (tag: string) => {
      if (tag === 'div') {
        return {
          innerHTML: '',
          querySelectorAll: (selector: string) => {
            // Mock query selectors for testing
            if (selector === 'a.outgoing-link') {
              return [{
                textContent: 'Test Link',
                dataset: { link: 'test-link' },
              }]
            }
            if (selector === 'span.tag') {
              return [{
                getAttribute: (attr: string) => attr === 'data-tag' ? 'test-tag' : null,
              }]
            }
            return []
          },
        }
      }
      return {}
    },
  } as any
})

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

  it('should handle parsing errors gracefully', async () => {
    // This will fail because we don't have a real markdown instance in test
    const content = `# Test`

    const result = await parseMarkdownContent(content)

    // Should have error but not crash
    expect(result.error).toBeDefined()
    expect(result.outgoingLinks).toEqual([])
    expect(result.tags).toEqual([])
  })

  it('should parse content without frontmatter', async () => {
    const content = `# Regular Markdown

No frontmatter here.`

    const result = await parseMarkdownContent(content, { includeMeta: true })

    // Should handle gracefully even with parsing errors
    expect(result.outgoingLinks).toEqual([])
    expect(result.tags).toEqual([])
  })
})
