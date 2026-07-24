import { getSourceFromPath, MarkdownSource } from '@/db/index'
import { describe, expect, it } from 'vitest'

describe('getSourceFromPath', () => {
  it('classifies only /post/ as Post and everything else as Memo', () => {
    expect(getSourceFromPath('/post/hello')).toBe(MarkdownSource.Post)
    expect(getSourceFromPath('/memo/project/note')).toBe(MarkdownSource.Memo)
    expect(getSourceFromPath('/memos/legacy-note')).toBe(MarkdownSource.Memo)
    expect(getSourceFromPath('/wiki/entities/transformer-architecture')).toBe(MarkdownSource.Memo)
    expect(getSourceFromPath('/about')).toBe(MarkdownSource.Memo)
  })
})
