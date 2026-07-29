import { CompletionContext, type CompletionResult } from '@codemirror/autocomplete'
import { markdown } from '@codemirror/lang-markdown'
import { EditorState } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { FILE_REFERENCE_COMPLETION_LIMIT, type FileReferenceCandidate, fileReferenceCompletionSource, filterFileReferenceCandidates, parseFileReferenceTrigger, planFileReferenceInsertion, toFileReferenceCandidates } from '../../components/editor/text-editor/file-reference-completion'

describe('parseFileReferenceTrigger', () => {
  it('opens with an empty query right after [[', () => {
    expect(parseFileReferenceTrigger('[[')).toEqual({ from: 2, query: '' })
  })

  it('captures the query typed after [[', () => {
    expect(parseFileReferenceTrigger('[[/pro')).toEqual({ from: 2, query: '/pro' })
  })

  it('reports the query offset relative to the line start', () => {
    expect(parseFileReferenceTrigger('some text [[alpha')).toEqual({ from: 12, query: 'alpha' })
  })

  it('ignores text without a [[ marker', () => {
    expect(parseFileReferenceTrigger('no trigger here')).toBeNull()
    expect(parseFileReferenceTrigger('[single')).toBeNull()
  })

  it('ignores an escaped \\[[ marker', () => {
    expect(parseFileReferenceTrigger('\\[[')).toBeNull()
    expect(parseFileReferenceTrigger('text \\[[query')).toBeNull()
  })

  it('closes the trigger once ]] was typed', () => {
    expect(parseFileReferenceTrigger('[[/a]] tail')).toBeNull()
  })

  it('uses the last [[ on the line', () => {
    expect(parseFileReferenceTrigger('[[/a]] and [[b')).toEqual({ from: 13, query: 'b' })
  })
})

function candidate(id: number, path: string, updatedAt: string): FileReferenceCandidate {
  return { id, path, title: path.split('/').filter(Boolean).at(-1) ?? '', updatedAt: new Date(updatedAt) }
}

const candidates: FileReferenceCandidate[] = [
  candidate(1, '/project/outlink', '2026-01-01'),
  candidate(2, '/memo/outing', '2026-02-01'),
  candidate(3, '/project/notes', '2026-03-01'),
  candidate(4, '/blog/outlink', '2026-04-01'),
]

function ids(result: FileReferenceCandidate[]) {
  return result.map(item => item.id)
}

describe('filterFileReferenceCandidates', () => {
  it('lists every candidate for an empty query, most recently updated first', () => {
    expect(ids(filterFileReferenceCandidates(candidates, ''))).toEqual([4, 3, 2, 1])
  })

  it('ranks an exact title match first', () => {
    expect(ids(filterFileReferenceCandidates(candidates, 'notes'))).toEqual([3])
  })

  it('keeps duplicate titles, breaking ties by recent update', () => {
    expect(ids(filterFileReferenceCandidates(candidates, 'outlink'))).toEqual([4, 1])
  })

  it('ranks title prefix matches before path matches', () => {
    expect(ids(filterFileReferenceCandidates(candidates, 'out'))).toEqual([4, 2, 1])
  })

  it('matches a path segment by prefix', () => {
    expect(ids(filterFileReferenceCandidates(candidates, 'proj'))).toEqual([3, 1])
  })

  it('matches anywhere in the path', () => {
    expect(ids(filterFileReferenceCandidates(candidates, 'link'))).toEqual([4, 1])
  })

  it('falls back to subsequence fuzzy matching', () => {
    expect(ids(filterFileReferenceCandidates(candidates, 'otl'))).toEqual([4, 1])
  })

  it('matches case-insensitively', () => {
    expect(ids(filterFileReferenceCandidates(candidates, 'OUTLINK'))).toEqual([4, 1])
  })

  it('matches a title even when the query keeps its leading slash', () => {
    expect(ids(filterFileReferenceCandidates(candidates, '/outlink'))).toEqual([4, 1])
  })

  it('excludes the currently edited File', () => {
    expect(ids(filterFileReferenceCandidates(candidates, 'outlink', 4))).toEqual([1])
  })

  it('returns nothing when no candidate matches', () => {
    expect(filterFileReferenceCandidates(candidates, 'zzzzz')).toEqual([])
  })

  it('breaks full ties by ascending path', () => {
    const tied = [
      candidate(1, '/b/same', '2026-01-01'),
      candidate(2, '/a/same', '2026-01-01'),
    ]
    expect(ids(filterFileReferenceCandidates(tied, 'same'))).toEqual([2, 1])
  })
})

describe('toFileReferenceCandidates', () => {
  it('drops recycled Files and keeps only id, path, title, and update time', () => {
    const records = [
      { id: 1, path: '/a/active', title: 'active', updatedAt: new Date('2026-01-01'), deletedAt: null, content: 'x' },
      { id: 2, path: '/a/trashed', title: 'trashed', updatedAt: new Date('2026-02-01'), deletedAt: new Date('2026-03-01'), content: 'y' },
    ]
    expect(toFileReferenceCandidates(records)).toEqual([
      { id: 1, path: '/a/active', title: 'active', updatedAt: new Date('2026-01-01') },
    ])
  })
})

describe('planFileReferenceInsertion', () => {
  it('appends the closing ]] when none follows the query', () => {
    expect(planFileReferenceInsertion('[[ab', 2, 4, '/x/y')).toEqual({
      from: 2,
      to: 4,
      insert: '/x/y]]',
      cursor: 2 + '/x/y]]'.length,
    })
  })

  it('consumes the auto-closed ]] so only one pair remains', () => {
    expect(planFileReferenceInsertion('[[ab]]', 2, 4, '/x/y')).toEqual({
      from: 2,
      to: 6,
      insert: '/x/y]]',
      cursor: 2 + '/x/y]]'.length,
    })
  })
})

describe('fileReferenceCompletionSource', () => {
  async function run(doc: string, pos: number, excludeId?: number, sourceCandidates = candidates): Promise<CompletionResult | null> {
    const state = EditorState.create({ doc, extensions: [markdown()] })
    const source = fileReferenceCompletionSource({ candidates: sourceCandidates, excludeId })
    const result = source(new CompletionContext(state, pos, false))
    return result instanceof Promise ? result : (result ?? null)
  }

  it('offers every candidate right after [[, replacing nothing yet', async () => {
    const result = await run('Hello [[', 8)
    expect(result?.from).toBe(8)
    expect(result?.to).toBe(8)
    expect(result?.filter).toBe(false)
    expect(result?.options.map(option => option.label)).toEqual(['outlink', 'notes', 'outing', 'outlink'])
    expect(result?.options[0].detail).toBe('/blog/outlink')
  })

  it('filters by the typed query and honors the excluded File', async () => {
    const result = await run('[[out', 5, 4)
    expect(result?.from).toBe(2)
    expect(result?.to).toBe(5)
    expect(result?.options.map(option => option.detail)).toEqual(['/memo/outing', '/project/outlink'])
  })

  it('stays silent inside inline code', async () => {
    expect(await run('`[[`', 3)).toBeNull()
  })

  it('stays silent inside fenced code', async () => {
    expect(await run('```\n[[\n```', 6)).toBeNull()
  })

  it('stays silent inside an indented code block', async () => {
    expect(await run('para\n\n    [[', 11)).toBeNull()
  })

  it('stays silent for an escaped \\[[', async () => {
    expect(await run('\\[[', 3)).toBeNull()
  })

  it('stays silent once the reference is closed', async () => {
    expect(await run('[[/a]] more', 11)).toBeNull()
  })

  it('shows a local no-match option instead of closing the picker', async () => {
    const result = await run('[[zzzzz', 7)
    expect(result?.from).toBe(2)
    expect(result?.options).toHaveLength(1)
    expect(result?.options[0].label).toBe('No matching Files')
    expect(result?.options[0].apply).toBeTypeOf('function')
  })

  it('shows the no-match option when the workspace has no Files at all', async () => {
    const result = await run('[[', 2, undefined, [])
    expect(result?.options.map(option => option.label)).toEqual(['No matching Files'])
  })

  it('caps the displayed candidates at the completion limit', async () => {
    const many = Array.from({ length: FILE_REFERENCE_COMPLETION_LIMIT + 1 }, (_, index) =>
      candidate(100 + index, `/memo/file-${String(index).padStart(2, '0')}`, `2026-01-${String(index + 1).padStart(2, '0')}`))
    const result = await run('[[file', 6, undefined, many)
    expect(result?.options).toHaveLength(FILE_REFERENCE_COMPLETION_LIMIT)
    expect(result?.options[0].detail).toBe('/memo/file-12')
    expect(result?.options.at(-1)?.detail).toBe('/memo/file-01')
  })
})
