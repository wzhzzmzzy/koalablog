import { MarkdownSource } from '@/db/index'
import { collectTagsAndLinks, linkGenerator } from '@/db/markdown'
import { describe, expect, it } from 'vitest'

describe('linkGenerator', () => {
  it('should generate basic kebab-case link', () => {
    const result = linkGenerator(MarkdownSource.Page, 'Hello World')
    expect(result).toBe('hello-world')
  })

  it('should handle Chinese characters', () => {
    const result = linkGenerator(MarkdownSource.Page, '你好世界')
    expect(result).toBe('')
  })

  it('should remove special characters', () => {
    const result = linkGenerator(MarkdownSource.Page, 'Hello!@#$%^&*()_+World')
    expect(result).toBe('hello-world')
  })

  it('should add post prefix for Post source', () => {
    const result = linkGenerator(MarkdownSource.Post, 'My First Post')
    expect(result).toBe('post/my-first-post')
  })

  it('should handle empty string', () => {
    const result = linkGenerator(MarkdownSource.Page, '')
    expect(result).toBe('')
  })

  it('should handle mixed characters', () => {
    const result = linkGenerator(MarkdownSource.Page, '你好Hello123世界World')
    expect(result).toBe('hello-123-world')
  })

  it('should handle multiple spaces', () => {
    const result = linkGenerator(MarkdownSource.Page, 'Hello   World')
    expect(result).toBe('hello-world')
  })
})

describe('collectTagsAndLinks', () => {
  it('should extract unique tags from content', () => {
    const markdown = {
      content: 'This is a #test with #multiple #tags and #test again',
      tags: '',
      incoming_links: '',
      outgoing_links: '',
    }
    const result = collectTagsAndLinks(markdown)
    expect(result.tags).toEqual(['test', 'multiple', 'tags'])
  })

  it('should extract tags without title', () => {
    const markdown = {
      content: `
# title

#tag1 #tag2 #tag3

## title2
`,
    }

    const result = collectTagsAndLinks(markdown)
    expect(result.tags).toEqual(['tag1', 'tag2', 'tag3'])
  })

  it('should extract unique links from content', () => {
    const markdown = {
      content: 'This has [[link1]] and [[link2]] with [[link1]] again',
      tags: '',
      incoming_links: '',
      outgoing_links: '',
    }
    const result = collectTagsAndLinks(markdown)
    expect(result.links).toEqual(['link1', 'link2'])
  })

  it('should handle empty content', () => {
    const markdown = {
      content: '',
      tags: '',
      incoming_links: '',
      outgoing_links: '',
    }
    const result = collectTagsAndLinks(markdown)
    expect(result.tags).toEqual([])
    expect(result.links).toEqual([])
  })

  it('should handle content with no tags or links', () => {
    const markdown = {
      content: 'Just plain text without any special markers',
      tags: '',
      incoming_links: '',
      outgoing_links: '',
    }
    const result = collectTagsAndLinks(markdown)
    expect(result.tags).toEqual([])
    expect(result.links).toEqual([])
  })

  it('should handle mixed content with tags and links', () => {
    const markdown = {
      content: '#tag1 and [[link1]] with #tag2 and [[link2]]',
      tags: '',
      incoming_links: '',
      outgoing_links: '',
    }
    const result = collectTagsAndLinks(markdown)
    expect(result.tags).toEqual(['tag1', 'tag2'])
    expect(result.links).toEqual(['link1', 'link2'])
  })

  it('should handle tags and links with special characters', () => {
    const markdown = {
      content: '#tag-with-dash and [[link with spaces]] #tag_with_underscore',
      tags: '',
      incoming_links: '',
      outgoing_links: '',
    }
    const result = collectTagsAndLinks(markdown)
    expect(result.tags).toEqual(['tag-with-dash', 'tag_with_underscore'])
    expect(result.links).toEqual(['link with spaces'])
  })
})
