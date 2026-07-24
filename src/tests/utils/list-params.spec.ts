import { MarkdownSource } from '@/db'
import { parseIndexListParams } from '@/lib/utils/list-params'
import { describe, expect, it } from 'vitest'

describe('parseIndexListParams', () => {
  it('defaults to the posts list without filters', () => {
    expect(parseIndexListParams(new URLSearchParams())).toEqual({
      source: MarkdownSource.Post,
      year: undefined,
      tag: undefined,
    })
  })

  it('parses source, year, and tag with composition', () => {
    expect(parseIndexListParams(new URLSearchParams('s=memo&y=2025&tag=gossip'))).toEqual({
      source: MarkdownSource.Memo,
      year: 2025,
      tag: 'gossip',
    })
  })

  it('falls back to posts and drops malformed filters', () => {
    expect(parseIndexListParams(new URLSearchParams('s=pages&y=20ab&tag='))).toEqual({
      source: MarkdownSource.Post,
      year: undefined,
      tag: undefined,
    })
  })
})
