import type { EditBuffer } from '@/components/editor/edit-buffer.svelte'
import { describe, expect, it } from 'vitest'
import { emptyFileFinderGroups } from '@/components/editor/file-finder-model'
import { makeFileRecord } from '@/tests/fixtures/file-record'

function buffer(fileId: number, dirty = true, conflict = false): EditBuffer {
  return {
    fileId,
    path: `/file-${fileId}`,
    renderer: 'markdown',
    content: '',
    private: false,
    baseRevision: 1,
    dirty,
    conflict: conflict
      ? { server: { path: `/file-${fileId}`, renderer: 'markdown', content: '', private: false, revision: 2 } }
      : null,
  }
}

describe('editor File Finder empty groups', () => {
  it('shows up to eight active dirty or conflicted Files before Recent', () => {
    const files = Array.from({ length: 10 }, (_, index) => makeFileRecord({ id: index + 1, path: `/file-${index + 1}` }))
    const buffers = new Map(files.map(file => [file.id, buffer(file.id, true, file.id === 10)]))

    const groups = emptyFileFinderGroups(files, buffers, [...files].reverse())

    expect(groups.localChanges.map(file => file.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(groups.recent.map(file => file.id)).toEqual([10, 9])
  })

  it('uses dirty Edit Buffer values when presenting Local changes', () => {
    const file = makeFileRecord({
      id: 1,
      path: '/saved-path',
      renderer: 'markdown',
      content: 'saved Source',
      private: false,
    })
    const dirty = buffer(file.id)
    dirty.path = '/renamed-path'
    dirty.renderer = 'svelte'
    dirty.content = '<h1>Unsaved Source</h1>'
    dirty.private = true

    const groups = emptyFileFinderGroups([file], new Map([[file.id, dirty]]), [])

    expect(groups.localChanges).toEqual([
      expect.objectContaining({
        id: file.id,
        path: '/renamed-path',
        title: 'renamed-path',
        renderer: 'svelte',
        content: '<h1>Unsaved Source</h1>',
        private: true,
      }),
    ])
  })

  it('excludes Local changes, recycled, missing, and duplicate IDs from Recent then caps it at twelve', () => {
    const files = Array.from({ length: 15 }, (_, index) => makeFileRecord({
      id: index + 1,
      path: `/file-${index + 1}`,
      deletedAt: index === 13 ? new Date('2026-08-05T00:00:00Z') : null,
    }))
    const buffers = new Map([[1, buffer(1)], [2, buffer(2, false, true)]])
    const byId = new Map(files.map(file => [file.id, file]))
    const recent = [2, 1, 14, 99, 15, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3]
      .map(id => byId.get(id) ?? makeFileRecord({ id }))
    const groups = emptyFileFinderGroups(files, buffers, recent)

    expect(groups.localChanges.map(file => file.id)).toEqual([1, 2])
    expect(groups.recent.map(file => file.id)).toEqual([15, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3])
  })

  it('omits groups when there are no local changes or usable Recent Files', () => {
    const recycled = makeFileRecord({ id: 1, deletedAt: new Date('2026-08-05T00:00:00Z') })

    expect(emptyFileFinderGroups([recycled], new Map(), [recycled])).toEqual({
      localChanges: [],
      recent: [],
    })
  })
})
