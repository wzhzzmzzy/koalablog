import { CompletionContext } from '@codemirror/autocomplete'
import { EditorState } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { markdownLanguageExtension } from '@/components/editor/text-editor/markdown-language'
import {
  filterTagCompletionCandidates,
  parseTagCompletionTrigger,
  tagCompletionSource,
  toTagCompletionCandidates,
} from '@/components/editor/text-editor/tag-completion'

function completion(doc: string, cursor = doc.length) {
  const state = EditorState.create({ doc, extensions: [markdownLanguageExtension()] })
  return tagCompletionSource([
    { tag: 'javascript', fileCount: 3, updatedAt: new Date('2026-08-01') },
    { tag: 'java', fileCount: 2, updatedAt: new Date('2026-08-02') },
  ])(new CompletionContext(state, cursor, true))
}

describe('tag completion', () => {
  it('recognizes legal hash triggers and rejects escaped, word-internal, and closed syntax', () => {
    expect(parseTagCompletionTrigger('#')).toEqual({ from: 1, query: '' })
    expect(parseTagCompletionTrigger('text #ja')).toEqual({ from: 6, query: 'ja' })
    expect(parseTagCompletionTrigger('word#ja')).toBeNull()
    expect(parseTagCompletionTrigger('\\#ja')).toBeNull()
    expect(parseTagCompletionTrigger('#ja ')).toBeNull()
    expect(parseTagCompletionTrigger('#one#')).toBeNull()
  })

  it('aggregates exact-case tags by File count and excludes unrepresentable tags', () => {
    expect(toTagCompletionCandidates([
      { tags: ['java', 'Java', 'with space'], updatedAt: new Date('2026-08-01') },
      { tags: ['java', 'hash#tag'], updatedAt: new Date('2026-08-03') },
      { tags: ['ignored'], updatedAt: new Date('2026-08-04'), deletedAt: new Date() },
    ])).toEqual([
      { tag: 'java', fileCount: 2, updatedAt: new Date('2026-08-03') },
      { tag: 'Java', fileCount: 1, updatedAt: new Date('2026-08-01') },
    ])
  })

  it('ranks prefix before substring, then frequency, recency, and label', () => {
    const result = filterTagCompletionCandidates([
      { tag: 'typescript', fileCount: 5, updatedAt: new Date('2026-08-03') },
      { tag: 'script', fileCount: 2, updatedAt: new Date('2026-08-02') },
      { tag: 'scripting', fileCount: 3, updatedAt: new Date('2026-08-01') },
    ], 'script')
    expect(result.map(item => item.tag)).toEqual(['scripting', 'script', 'typescript'])

    const ties = filterTagCompletionCandidates([
      { tag: 'same-z', fileCount: 2, updatedAt: new Date('2026-08-01') },
      { tag: 'same-a', fileCount: 2, updatedAt: new Date('2026-08-02') },
      { tag: 'same-b', fileCount: 2, updatedAt: new Date('2026-08-02') },
    ], 'same')
    expect(ties.map(item => item.tag)).toEqual(['same-a', 'same-b', 'same-z'])
  })

  it('opens immediately after hash and replaces only the query', () => {
    expect(completion('text #')).toMatchObject({ from: 6, to: 6 })
    expect(completion('text #jav')).toMatchObject({ from: 6, to: 9 })
  })

  it('limits an open completion list to 12 ranked options', async () => {
    const candidates = Array.from({ length: 20 }, (_, index) => ({
      tag: `tag-${index.toString().padStart(2, '0')}`,
      fileCount: 20 - index,
      updatedAt: new Date('2026-08-01'),
    }))
    const state = EditorState.create({ doc: '#', extensions: [markdownLanguageExtension()] })
    const result = await tagCompletionSource(candidates)(new CompletionContext(state, 1, true))

    expect(result?.options).toHaveLength(12)
    expect(result?.options.map(option => option.label)).toEqual(candidates.slice(0, 12).map(candidate => candidate.tag))
  })

  it('does not open in frontmatter, headings, code, links, or escaped syntax', () => {
    expect(completion('---\ntags: #ja\n---\nBody', 13)).toBeNull()
    expect(completion('# ')).toBeNull()
    expect(completion('`#ja`', 4)).toBeNull()
    expect(completion('[#ja](/path)', 4)).toBeNull()
    expect(completion('\\#ja')).toBeNull()
  })
})
