import fs from 'node:fs/promises'
import path from 'node:path'
import { useTagPlugin } from '@/lib/markdown/tag-plugin'
import MarkdownIt from 'markdown-it'
import { describe, expect, it } from 'vitest'

describe('tag-plugin', () => {
  const createMd = (options?: { className?: string }) => {
    const md = new MarkdownIt()
    useTagPlugin(md, options)
    return md
  }

  describe('basic functionality', () => {
    it('should parse hash tags without closing hash', () => {
      const md = createMd()
      const result = md.render('#tag')

      expect(result).toContain('<span class="tag"')
      expect(result).toContain('data-tag="tag"')
      expect(result).toContain('role="button"')
      expect(result).toContain('tabindex="0"')
      expect(result).toContain('>tag</span>')
    })

    it('should parse hash tags with closing hash', () => {
      const md = createMd()
      const result = md.render('#tag#')

      expect(result).toContain('<span class="tag"')
      expect(result).toContain('data-tag="tag"')
      expect(result).toContain('>tag</span>')
    })

    it('should parse multiple tags in text', () => {
      const md = createMd()
      const result = md.render('Text with #first and #second tags.')

      expect(result).toContain('data-tag="first"')
      expect(result).toContain('data-tag="second"')
      expect(result).toContain('>first</span>')
      expect(result).toContain('>second</span>')
    })

    it('should handle tags at the beginning of text', () => {
      const md = createMd()
      const result = md.render('#beginning tag text')

      expect(result).toContain('data-tag="beginning"')
      expect(result).toContain('>beginning</span>')
    })

    it('should handle tags at the end of text', () => {
      const md = createMd()
      const result = md.render('text ending with #end')

      expect(result).toContain('data-tag="end"')
      expect(result).toContain('>end</span>')
    })
  })

  describe('tag validation', () => {
    it('should not parse hash followed by space', () => {
      const md = createMd()
      const result = md.render('# not a tag')

      expect(result).not.toContain('class="tag"')
      expect(result).toContain('<h1>not a tag</h1>') // MarkdownIt parses this as h1
    })

    it('should not parse hash in middle of word', () => {
      const md = createMd()
      const result = md.render('word#hash should not be tag')

      expect(result).not.toContain('class="tag"')
      expect(result).toContain('word#hash')
    })

    it('should not parse empty tag', () => {
      const md = createMd()
      const result = md.render('##')

      expect(result).not.toContain('class="tag"')
      expect(result).toContain('<h2></h2>') // MarkdownIt parses this as h2
    })

    it('should not parse hash after alphanumeric characters', () => {
      const md = createMd()
      const result = md.render('a#tag B#tag 9#tag')

      expect(result).not.toContain('class="tag"')
      expect(result).toContain('a#tag B#tag 9#tag')
    })
  })

  describe('tag boundaries', () => {
    it('should stop at whitespace', () => {
      const md = createMd()
      const result = md.render('#tag with space')

      expect(result).toContain('data-tag="tag"')
      expect(result).toContain('>tag</span>')
      expect(result).toContain('with space')
    })

    it('should stop at newline', () => {
      const md = createMd()
      const result = md.render('#tag\nnewline')

      expect(result).toContain('data-tag="tag"')
      expect(result).toContain('>tag</span>')
    })

    it('should stop at tab', () => {
      const md = createMd()
      const result = md.render('#tag\ttab')

      expect(result).toContain('data-tag="tag"')
      expect(result).toContain('>tag</span>')
    })

    it('should handle tags separated by punctuation', () => {
      const md = createMd()
      const result = md.render('#first, #second.')

      // The plugin includes punctuation in tag names since it stops at whitespace
      expect(result).toContain('data-tag="first,"')
      expect(result).toContain('data-tag="second."')
    })
  })

  describe('custom className option', () => {
    it('should use custom className', () => {
      const md = createMd({ className: 'custom-tag' })
      const result = md.render('#test')

      expect(result).toContain('class="custom-tag"')
      expect(result).not.toContain('class="tag"')
    })

    it('should use default className when none provided', () => {
      const md = createMd({})
      const result = md.render('#test')

      expect(result).toContain('class="tag"')
    })
  })

  describe('hTML escaping and security', () => {
    it('should escape HTML in tag names', () => {
      const md = createMd()
      const result = md.render('#<script>')

      expect(result).toContain('data-tag="&lt;script&gt;"')
      expect(result).toContain('>&lt;script&gt;</span>')
      expect(result).not.toContain('<script>')
    })

    it('should escape quotes in tag names', () => {
      const md = createMd()
      const result = md.render('#tag"quote')

      expect(result).toContain('data-tag="tag&quot;quote"')
      expect(result).toContain('>tag&quot;quote</span>')
    })

    it('should escape ampersands', () => {
      const md = createMd()
      const result = md.render('#tag&amp')

      expect(result).toContain('data-tag="tag&amp;amp"')
      expect(result).toContain('>tag&amp;amp</span>')
    })
  })

  describe('accessibility attributes', () => {
    it('should include proper accessibility attributes', () => {
      const md = createMd()
      const result = md.render('#accessible')

      expect(result).toContain('role="button"')
      expect(result).toContain('tabindex="0"')
      expect(result).toContain('title="Click to search tag: accessible"')
    })

    it('should escape HTML in title attribute', () => {
      const md = createMd()
      const result = md.render('#<test>')

      expect(result).toContain('title="Click to search tag: &lt;test&gt;"')
    })
  })

  describe('complex tag names', () => {
    it('should handle tags with numbers', () => {
      const md = createMd()
      const result = md.render('#tag123')

      expect(result).toContain('data-tag="tag123"')
      expect(result).toContain('>tag123</span>')
    })

    it('should handle tags with hyphens and underscores', () => {
      const md = createMd()
      const result = md.render('#tag-name #tag_name')

      expect(result).toContain('data-tag="tag-name"')
      expect(result).toContain('data-tag="tag_name"')
    })

    it('should handle unicode characters', () => {
      const md = createMd()
      const result = md.render('#测试 #🏷️')

      expect(result).toContain('data-tag="测试"')
      expect(result).toContain('data-tag="🏷️"')
    })
  })

  describe('edge cases', () => {
    it('should handle tag at end of document', () => {
      const md = createMd()
      const result = md.render('ending #tag')

      expect(result).toContain('data-tag="tag"')
      expect(result).toContain('>tag</span>')
    })

    it('should work in fence', () => {
      const md = createMd()
      const result = md.render(
        '```\n'
        + 'some code\n'
        + '#some comment\n'
        + '```',
      )

      expect(result).not.toContain('data-tag')
    })

    it('should handle multiple consecutive tags', () => {
      const md = createMd()
      const result = md.render('#first#second#third')

      // The plugin parses the first tag, then the rest becomes normal text
      expect(result).toContain('data-tag="first"')
      expect(result).toContain('second#third') // Rest is not parsed as tags
    })

    it('should handle mixed markdown with tags', () => {
      const md = createMd()
      const result = md.render('**bold** and #tag and *italic*')

      expect(result).toContain('<strong>bold</strong>')
      expect(result).toContain('data-tag="tag"')
      expect(result).toContain('<em>italic</em>')
    })

    it('should work in list items', () => {
      const md = createMd()
      const result = md.render('- Item with #tag')

      expect(result).toContain('data-tag="tag"')
      expect(result).toContain('<li>')
    })

    it('should work in code blocks (should not parse)', () => {
      const md = createMd()
      const result = md.render('`#notag`')

      expect(result).not.toContain('data-tag="notag"')
      expect(result).toContain('<code>')
    })

    it('should work in links (should not parse)', () => {
      const md = createMd()
      const result = md.render('[test #tag](/some/link)')

      expect(result).not.toContain('data-tag')
      expect(result).toContain('<a')
    })
  })

  describe('performance and boundary conditions', () => {
    it('should handle very long tag names', () => {
      const md = createMd()
      const longTag = 'a'.repeat(100)
      const result = md.render(`#${longTag}`)

      expect(result).toContain(`data-tag="${longTag}"`)
    })

    it('should handle many tags in one document', () => {
      const md = createMd()
      const manyTags = Array.from({ length: 50 }, (_, i) => `#tag${i}`).join(' ')
      const result = md.render(manyTags)

      for (let i = 0; i < 50; i++) {
        expect(result).toContain(`data-tag="tag${i}"`)
      }
    })
  })
})
