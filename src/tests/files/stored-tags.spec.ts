import { describe, expect, it } from 'vitest'
import { decodeStoredTags, encodeStoredTags } from '@/lib/files/stored-tags'

describe('stored Effective Tags codec', () => {
  it('writes deterministic JSON arrays', () => {
    expect(encodeStoredTags(['java', 'comma,tag', '测试'])).toBe('["java","comma,tag","测试"]')
  })

  it('reads JSON arrays without losing commas or case', () => {
    expect(decodeStoredTags('["Java","comma,tag","java"]')).toEqual(['Java', 'comma,tag', 'java'])
  })

  it('reads legacy comma-separated values', () => {
    expect(decodeStoredTags('one, two,测试')).toEqual(['one', 'two', '测试'])
  })

  it('returns no tags for absent or malformed structured values', () => {
    expect(decodeStoredTags(null)).toEqual([])
    expect(decodeStoredTags('')).toEqual([])
    expect(decodeStoredTags('{"tag":"one"}')).toEqual([])
    expect(decodeStoredTags('["one",2]')).toEqual([])
    expect(decodeStoredTags('["unterminated"')).toEqual([])
  })
})
