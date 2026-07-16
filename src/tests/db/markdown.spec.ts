import { getSourceFromPath, MarkdownSource } from '@/db/index'
import { describe, expect, it } from 'vitest'

describe('getSourceFromPath', () => {
  it('classifies absolute nested Paths', () => {
    expect(getSourceFromPath('/wiki/entities/transformer-architecture')).toBe(MarkdownSource.Wiki)
    expect(getSourceFromPath('/memo/project/note')).toBe(MarkdownSource.Memo)
    expect(getSourceFromPath('/memos/legacy-note')).toBe(MarkdownSource.Memo)
    expect(getSourceFromPath('/post/hello')).toBe(MarkdownSource.Post)
    expect(getSourceFromPath('/about')).toBe(MarkdownSource.Page)
  })
})
