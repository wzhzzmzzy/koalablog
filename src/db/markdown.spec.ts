import { describe, expect, it } from 'vitest'
import { MarkdownSource } from '.'
import { linkGenerator } from './markdown'

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
