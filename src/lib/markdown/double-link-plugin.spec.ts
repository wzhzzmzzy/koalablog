import MarkdownIt from 'markdown-it'
import { describe, expect, it } from 'vitest'
import { type DoubleLinkPluginOptions, useDoubleLink } from './double-link-plugin'

describe('double-link-plugin', () => {
  const createMd = (options?: DoubleLinkPluginOptions) => {
    const md = new MarkdownIt()
    useDoubleLink(md, options)
    return md
  }

  describe('basic functionality', () => {
    it('should parse double-bracketed links', () => {
      const md = createMd()
      const result = md.render('[[Test Link]]')

      expect(result).toContain('<a')
      expect(result).toContain('class="outgoing-link"')
      expect(result).toContain('target="_blank"')
      expect(result).toContain('>Test Link</a>')
    })

    it('should not parse incomplete double links', () => {
      const md = createMd()
      const result = md.render('[[incomplete')

      expect(result).not.toContain('<a')
      expect(result).toContain('[[incomplete')
    })

    it('should not parse single brackets', () => {
      const md = createMd()
      const result = md.render('[single bracket]')

      expect(result).not.toContain('class="outgoing-link"')
      expect(result).toContain('[single bracket]')
    })

    it('should handle empty content', () => {
      const md = createMd()
      const result = md.render('[[]]')

      expect(result).not.toContain('<a')
      expect(result).toContain('[[]]')
    })

    it('should handle whitespace-only content', () => {
      const md = createMd()
      const result = md.render('[[ ]]')

      expect(result).not.toContain('<a')
      expect(result).toContain('[[ ]]')
    })
  })

  describe('options configuration', () => {
    it('should use custom className', () => {
      const md = createMd({ className: 'custom-link' })
      const result = md.render('[[Custom Link]]')

      expect(result).toContain('class="custom-link"')
      expect(result).not.toContain('class="outgoing-link"')
    })

    it('should use custom target', () => {
      const md = createMd({ target: '_self' })
      const result = md.render('[[Self Link]]')

      expect(result).toContain('target="_self"')
      expect(result).not.toContain('target="_blank"')
    })
  })

  describe('post link resolution', () => {
    const mockPosts = [
      { subject: 'Existing Post', link: 'post/existing-post' },
      { subject: 'External Link', link: 'https://example.com' },
      { subject: 'Root Page', link: 'root-page' },
    ]

    it('should resolve existing post links', () => {
      const md = createMd({ allPostLinks: mockPosts })
      const result = md.render('[[Existing Post]]')

      expect(result).toContain('href="/post/existing-post"')
      expect(result).toContain('data-link="post/existing-post"')
    })

    it('should handle external URLs', () => {
      const md = createMd({ allPostLinks: mockPosts })
      const result = md.render('[[External Link]]')

      expect(result).toContain('href="https://example.com"')
      expect(result).toContain('data-link="https://example.com"')
    })

    it('should handle root-level pages', () => {
      const md = createMd({ allPostLinks: mockPosts })
      const result = md.render('[[Root Page]]')

      expect(result).toContain('href="/root-page"')
      expect(result).toContain('data-link="root-page"')
    })

    it('should handle non-existing links', () => {
      const md = createMd({ allPostLinks: mockPosts })
      const result = md.render('[[Non Existing]]')

      expect(result).not.toContain('href=')
      expect(result).not.toContain('data-link=')
      expect(result).toContain('>Non Existing</a>')
    })

    it('should handle empty allPostLinks', () => {
      const md = createMd({ allPostLinks: [] })
      const result = md.render('[[Any Link]]')

      expect(result).not.toContain('href=')
      expect(result).not.toContain('data-link=')
    })
  })

  describe('multiple links in content', () => {
    it('should parse multiple double links', () => {
      const md = createMd({
        allPostLinks: [
          { subject: 'First', link: 'first' },
          { subject: 'Second', link: 'second' },
        ],
      })
      const result = md.render('Here are [[First]] and [[Second]] links.')

      expect(result).toContain('href="/first"')
      expect(result).toContain('href="/second"')
      expect(result).toContain('>First</a>')
      expect(result).toContain('>Second</a>')
    })

    it('should handle mixed content with markdown', () => {
      const md = createMd({
        allPostLinks: [{ subject: 'Bold Link', link: 'bold-link' }],
      })
      const result = md.render('**Bold text** and [[Bold Link]] in same paragraph.')

      expect(result).toContain('<strong>Bold text</strong>')
      expect(result).toContain('href="/bold-link"')
      expect(result).toContain('>Bold Link</a>')
    })
  })

  describe('hTML escaping', () => {
    it('should escape HTML in link titles', () => {
      const md = createMd()
      const result = md.render('[[<script>alert("xss")</script>]]')

      expect(result).toContain('&lt;script&gt;')
      expect(result).toContain('&lt;/script&gt;')
      expect(result).not.toContain('<script>')
    })

    it('should escape HTML in attributes', () => {
      const md = createMd({
        allPostLinks: [{
          subject: 'Test Link',
          link: 'test" onclick="alert(1)',
        }],
      })
      const result = md.render('[[Test Link]]')

      expect(result).toContain('data-link="test&quot; onclick=&quot;alert(1)"')
      expect(result).not.toContain('onclick="alert(1)"')
    })
  })

  describe('edge cases', () => {
    it('should handle nested brackets', () => {
      const md = createMd()
      const result = md.render('[[Link [with] brackets]]')

      expect(result).toContain('>Link [with] brackets</a>')
    })

    it('should handle special characters', () => {
      const md = createMd()
      const result = md.render('[[Link & Special Characters]]')

      expect(result).toContain('>Link &amp; Special Characters</a>')
    })

    it('should handle unicode characters', () => {
      const md = createMd()
      const result = md.render('[[Unicode 测试 🔗]]')

      expect(result).toContain('>Unicode 测试 🔗</a>')
    })

    it('should trim whitespace in link titles', () => {
      const md = createMd({
        allPostLinks: [{ subject: 'Trimmed', link: 'trimmed' }],
      })
      const result = md.render('[[ Trimmed ]]')

      expect(result).toContain('href="/trimmed"')
      expect(result).toContain('>Trimmed</a>')
    })
  })
})
