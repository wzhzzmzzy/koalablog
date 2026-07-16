import { getSourceFromPath, MarkdownSource } from '@/db/index'
import { pathGenerator } from '@/db/markdown'
import { describe, expect, it } from 'vitest'

describe('legacy blank-creation Path fallback', () => {
  it('generates absolute extensionless Paths for every Source category', () => {
    expect(pathGenerator(MarkdownSource.Post, 'Hello World')).toBe('/post/hello-world')
    expect(pathGenerator(MarkdownSource.Memo, 'Project Note')).toBe('/memo/project-note')
    expect(pathGenerator(MarkdownSource.Wiki, 'Architecture')).toBe('/wiki/architecture')
    expect(pathGenerator(MarkdownSource.Page, 'About')).toBe('/about')
  })

  it('preserves a Unicode Title when no ASCII slug exists', () => {
    expect(pathGenerator(MarkdownSource.Page, '你好世界')).toBe('/你好世界')
  })
})

describe('getSourceFromPath', () => {
  it('classifies absolute nested Paths', () => {
    expect(getSourceFromPath('/wiki/entities/transformer-architecture')).toBe(MarkdownSource.Wiki)
    expect(getSourceFromPath('/memo/project/note')).toBe(MarkdownSource.Memo)
    expect(getSourceFromPath('/post/hello')).toBe(MarkdownSource.Post)
    expect(getSourceFromPath('/about')).toBe(MarkdownSource.Page)
  })
})
