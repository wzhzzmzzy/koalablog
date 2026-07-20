import { MarkdownSource } from '@/db'
import { getDisplayTitle } from '@/lib/files/display-title'
import { describe, expect, it } from 'vitest'

describe('getDisplayTitle', () => {
  it('uses a Post frontmatter title without changing the File Title', () => {
    expect(getDisplayTitle({
      source: MarkdownSource.Post,
      title: '2026-07-file-model',
      content: '---\ntitle: "From files to posts"\n---\n\nBody',
    })).toBe('From files to posts')
  })

  it('falls back to the File Title when the Post title is absent or invalid', () => {
    expect(getDisplayTitle({
      source: MarkdownSource.Post,
      title: 'fallback',
      content: '---\ntitle: true\n---\n\nBody',
    })).toBe('fallback')
  })

  it('does not treat frontmatter title as a display override for non-Post Files', () => {
    expect(getDisplayTitle({
      source: MarkdownSource.Memo,
      title: 'memo-file-name',
      content: '---\ntitle: "Private thought"\n---\n\nBody',
    })).toBe('memo-file-name')
  })
})
