import { describe, expect, it } from 'vitest'
import {
  highlightSearchText,
  type InstantSearchEditBuffer,
  SEARCH_MATCH_KIND,
  searchFiles,
} from '@/components/editor/instant-search'
import { makeFileRecord } from '@/tests/fixtures/file-record'

function buffers(entries: Array<[number, InstantSearchEditBuffer]> = []) {
  return new Map(entries)
}

describe('editor instant search', () => {
  it('uses the entire input as a case-insensitive literal substring', () => {
    const file = makeFileRecord({ path: '/notes/editor-search', content: 'A focused Editor Search note' })

    const result = searchFiles([file], 'editor search', buffers())

    expect(result.total).toBe(1)
    expect(result.results[0]).toMatchObject({
      primaryMatch: SEARCH_MATCH_KIND.Source,
      sourceMatchCount: 1,
    })
    expect(searchFiles([file], 'editor note', buffers()).total).toBe(0)
  })

  it('ranks Path before Tag before Source, then newer Files first', () => {
    const source = makeFileRecord({ id: 1, path: '/one', content: 'needle', updatedAt: new Date('2026-08-01') })
    const tagOlder = makeFileRecord({ id: 2, path: '/two', tags: 'needle', updatedAt: new Date('2026-08-02') })
    const tagNewer = makeFileRecord({ id: 3, path: '/three', tags: 'needle', updatedAt: new Date('2026-08-03') })
    const path = makeFileRecord({ id: 4, path: '/needle-path', updatedAt: new Date('2026-08-01') })

    const result = searchFiles([source, tagOlder, path, tagNewer], 'needle', buffers())

    expect(result.results.map(entry => entry.file.id)).toEqual([4, 3, 2, 1])
    expect(result.results.map(entry => entry.primaryMatch)).toEqual([
      SEARCH_MATCH_KIND.Path,
      SEARCH_MATCH_KIND.Tag,
      SEARCH_MATCH_KIND.Tag,
      SEARCH_MATCH_KIND.Source,
    ])
  })

  it('excludes leading Markdown frontmatter from Source matching', () => {
    const file = makeFileRecord({
      content: '---\ntitle: Private metadata\n---\n\nVisible Source',
    })

    expect(searchFiles([file], 'private metadata', buffers()).total).toBe(0)
    expect(searchFiles([file], 'visible source', buffers()).results[0]).toMatchObject({
      primaryMatch: SEARCH_MATCH_KIND.Source,
      sourceSnippet: 'Visible Source',
    })
  })

  it('searches complete Svelte Source without Markdown frontmatter stripping', () => {
    const file = makeFileRecord({
      renderer: 'svelte',
      content: '<script>const searchable = true</script>',
    })

    const result = searchFiles([file], 'const searchable', buffers())

    expect(result.results[0]).toMatchObject({
      primaryMatch: SEARCH_MATCH_KIND.Source,
      sourceMatchCount: 1,
    })
  })

  it('uses a dirty Edit Buffer for Path, Source, and re-analysed Tags', () => {
    const file = makeFileRecord({
      id: 10,
      path: '/saved-path',
      content: 'saved body',
      tags: 'saved',
    })
    const dirty = buffers([[file.id, {
      path: '/edited-path',
      renderer: 'markdown',
      content: '#edited-tag\nEdited body',
      dirty: true,
    }]])

    expect(searchFiles([file], 'saved', dirty).total).toBe(0)
    expect(searchFiles([file], 'edited-path', dirty).results[0]).toMatchObject({
      title: 'edited-path',
      dirty: true,
      primaryMatch: SEARCH_MATCH_KIND.Path,
    })
    expect(searchFiles([file], 'edited-tag', dirty).results[0]).toMatchObject({
      matchedTags: ['edited-tag'],
      matches: [SEARCH_MATCH_KIND.Tag, SEARCH_MATCH_KIND.Source],
      dirty: true,
    })
    expect(searchFiles([file], 'edited body', dirty).results[0].sourceSnippet).toContain('Edited body')
  })

  it('excludes trashed Files and limits rendered results after counting all matches', () => {
    const active = makeFileRecord({ id: 1, path: '/active', content: 'needle' })
    const otherActive = makeFileRecord({ id: 2, path: '/other', content: 'needle' })
    const trashed = makeFileRecord({ id: 3, path: '/trashed', content: 'needle', deletedAt: new Date() })

    const result = searchFiles([active, trashed, otherActive], 'needle', buffers(), 1)

    expect(result.total).toBe(2)
    expect(result.results).toHaveLength(1)
    expect(result.results[0].file.id).not.toBe(trashed.id)
  })

  it('returns a two-sided Source excerpt, occurrence count, and safe text segments', () => {
    const file = makeFileRecord({
      content: `${'before '.repeat(20)}needle middle needle ${'after '.repeat(20)}`,
    })

    const result = searchFiles([file], 'needle', buffers()).results[0]

    expect(result.sourceMatchCount).toBe(2)
    expect(result.sourceSnippet).toContain('needle')
    expect(result.sourceSnippet?.startsWith('…')).toBe(true)
    expect(highlightSearchText('<script>needle</script>', 'needle')).toEqual([
      { text: '<script>', matched: false },
      { text: 'needle', matched: true },
      { text: '</script>', matched: false },
    ])
  })
})
