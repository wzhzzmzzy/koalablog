import { describe, expect, it } from 'vitest'
import { createRecentFiles } from '@/components/editor/recent-files.svelte'
import { makeFileRecord } from '@/tests/fixtures/file-record'

class MemoryStorage {
  private values = new Map<string, string>()

  getItem(key: string) {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string) {
    this.values.set(key, value)
  }
}

describe('editor Recent Files', () => {
  it('records newest Files first, removes duplicates, and keeps at most twenty IDs', () => {
    const storage = new MemoryStorage()
    const recent = createRecentFiles(storage)

    for (let id = 1; id <= 21; id += 1)
      recent.record(id)
    recent.record(10)

    const files = Array.from({ length: 21 }, (_, index) => makeFileRecord({ id: index + 1 }))
    expect(recent.resolve(files).map(file => file.id)).toEqual([
      10,
      21,
      20,
      19,
      18,
      17,
      16,
      15,
      14,
      13,
      12,
      11,
      9,
      8,
      7,
      6,
      5,
      4,
      3,
      2,
    ])
  })

  it('drops missing and recycled Files when resolving browser-local IDs', () => {
    const storage = new MemoryStorage()
    storage.setItem('koala-editor-recent-files-v1', JSON.stringify({
      schemaVersion: 1,
      fileIds: [3, 2, 1, 2],
    }))
    const recent = createRecentFiles(storage)
    const active = makeFileRecord({ id: 1 })
    const recycled = makeFileRecord({ id: 2, deletedAt: new Date('2026-08-05T00:00:00Z') })

    expect(recent.resolve([active, recycled]).map(file => file.id)).toEqual([1])
  })

  it('falls back to an empty recent list when storage is malformed or unavailable', () => {
    const storage = new MemoryStorage()
    storage.setItem('koala-editor-recent-files-v1', '{not json')

    expect(createRecentFiles(storage).resolve([makeFileRecord({ id: 1 })])).toEqual([])
    expect(createRecentFiles(null).resolve([makeFileRecord({ id: 1 })])).toEqual([])
  })
})
