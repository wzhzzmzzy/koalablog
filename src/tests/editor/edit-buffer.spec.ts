import {
  EDIT_BUFFERS_STORAGE_KEY,
  editBuffers,
  initializeEditBuffers,
  LEGACY_DRAFTS_STORAGE_KEY,
  setEditBuffer,
} from '@/components/editor/edit-buffer.svelte'
import {
  editorStore,
  replaceItemsByPrefix,
  setCurrentFile,
  setItems,
} from '@/components/editor/store.svelte'
import { makeFileRecord } from '@/tests/fixtures/file-record'
import { afterEach, describe, expect, it } from 'vitest'

class MemoryStorage {
  private values = new Map<string, string>()

  getItem(key: string) {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string) {
    this.values.set(key, value)
  }

  removeItem(key: string) {
    this.values.delete(key)
  }
}

class FailingEditBufferStorage extends MemoryStorage {
  setItem(key: string, value: string) {
    if (key === EDIT_BUFFERS_STORAGE_KEY)
      throw new Error('storage full')
    super.setItem(key, value)
  }
}

afterEach(() => editBuffers.clear())

describe('editor Edit Buffer persistence', () => {
  it('migrates only legacy entries that map unambiguously to one active File', () => {
    const active = makeFileRecord({ id: 7, path: '/memo/active', content: 'server', revision: 4 })
    const deleted = makeFileRecord({ id: 8, path: '/memo/deleted', deletedAt: new Date('2026-07-16T00:00:00Z') })
    const malformed = makeFileRecord({ id: 9, path: '/memo/malformed' })
    const storage = new MemoryStorage()
    storage.setItem(LEGACY_DRAFTS_STORAGE_KEY, JSON.stringify([
      [active.path, { ...active, path: '/memo/renamed', content: 'local' }],
      [deleted.path, { ...deleted, content: 'must not migrate' }],
      ['/memo/wrong-id', { ...active, id: 999, path: '/memo/wrong-id', content: 'wrong File' }],
      [malformed.path, { path: 42 }],
    ]))

    initializeEditBuffers([active, deleted, malformed], storage)

    expect(Array.from(editBuffers.entries())).toEqual([[
      active.id,
      {
        fileId: active.id,
        path: '/memo/renamed',
        content: 'local',
        private: active.private,
        baseRevision: active.revision,
        dirty: true,
        conflict: null,
      },
    ]])
    expect(storage.getItem(LEGACY_DRAFTS_STORAGE_KEY)).toBeNull()
    expect(JSON.parse(storage.getItem(EDIT_BUFFERS_STORAGE_KEY)!)).toMatchObject({ schemaVersion: 1 })
  })

  it('restores v1 buffers by File ID and drops deleted or missing Files', () => {
    const active = makeFileRecord({ id: 7, path: '/memo/active', content: 'server', revision: 4 })
    const deleted = makeFileRecord({ id: 8, path: '/memo/deleted', deletedAt: new Date('2026-07-16T00:00:00Z') })
    const storage = new MemoryStorage()
    const buffer = {
      fileId: active.id,
      path: '/memo/renamed',
      content: 'local',
      private: true,
      baseRevision: active.revision,
      dirty: true,
      conflict: null,
    }
    storage.setItem(EDIT_BUFFERS_STORAGE_KEY, JSON.stringify({
      schemaVersion: 1,
      buffers: [
        buffer,
        { ...buffer, fileId: deleted.id },
        { ...buffer, fileId: 999 },
      ],
    }))

    initializeEditBuffers([active, deleted], storage)

    expect(Array.from(editBuffers.entries())).toEqual([[active.id, buffer]])
  })

  it('keeps legacy state when persisting the migrated Edit Buffer fails', () => {
    const active = makeFileRecord({ id: 7, path: '/memo/active', content: 'server', revision: 4 })
    const storage = new FailingEditBufferStorage()
    const legacy = JSON.stringify([
      [active.path, { ...active, content: 'local' }],
    ])
    storage.setItem(LEGACY_DRAFTS_STORAGE_KEY, legacy)

    expect(() => initializeEditBuffers([active], storage)).toThrowError('storage full')

    expect(storage.getItem(LEGACY_DRAFTS_STORAGE_KEY)).toBe(legacy)
  })
})

describe('editor Edit Buffer refresh reconciliation', () => {
  it('keeps a dirty Edit Buffer when a same-revision server refresh arrives', () => {
    const server = makeFileRecord({ id: 7, path: '/memo/active', content: 'server', revision: 4 })
    const buffer = {
      fileId: server.id,
      path: '/memo/renamed',
      content: 'local',
      private: server.private,
      baseRevision: server.revision,
      dirty: true,
      conflict: null,
    }
    setItems([server])
    setCurrentFile(server)
    setEditBuffer(buffer)

    replaceItemsByPrefix('/memo/', [{ ...server, updatedAt: new Date('2026-07-17T00:00:00Z') }])

    expect(editBuffers.get(server.id)).toEqual(buffer)
    expect(editorStore.currentFile?.id).toBe(server.id)
  })

  it('marks a dirty Edit Buffer conflicted when a newer server revision arrives', () => {
    const server = makeFileRecord({ id: 7, path: '/memo/active', content: 'server', revision: 4 })
    const newer = { ...server, content: 'remote', revision: 5, updatedAt: new Date('2026-07-17T00:00:00Z') }
    setItems([server])
    setCurrentFile(server)
    setEditBuffer({
      fileId: server.id,
      path: '/memo/renamed',
      content: 'local',
      private: server.private,
      baseRevision: server.revision,
      dirty: true,
      conflict: null,
    })

    replaceItemsByPrefix('/memo/', [newer])

    expect(editBuffers.get(server.id)?.conflict).toEqual({
      server: {
        path: newer.path,
        content: newer.content,
        private: newer.private,
        revision: newer.revision,
      },
    })
    expect(editorStore.currentFile).toEqual(newer)
  })
})

describe('editor Edit Buffer lifecycle', () => {
  it('removes the Edit Buffer and current private state when refresh confirms purge', () => {
    const purged = makeFileRecord({ id: 7, path: '/memo/purged', content: 'server', revision: 4 })
    const fallback = makeFileRecord({ id: 8, path: '/post/fallback' })
    setItems([purged, fallback])
    setCurrentFile(purged)
    setEditBuffer({
      fileId: purged.id,
      path: purged.path,
      content: 'local',
      private: purged.private,
      baseRevision: purged.revision,
      dirty: true,
      conflict: null,
    })

    replaceItemsByPrefix('/', [fallback])

    expect(editBuffers.has(purged.id)).toBe(false)
    expect(editorStore.items).toEqual([fallback])
    expect(editorStore.currentFile).toEqual(fallback)
  })

  it('preserves the Edit Buffer when a scoped refresh cannot distinguish move from purge', () => {
    const moved = makeFileRecord({ id: 7, path: '/memo/moved', content: 'server', revision: 4 })
    const fallback = makeFileRecord({ id: 8, path: '/project/fallback' })
    const buffer = {
      fileId: moved.id,
      path: '/project/moved',
      content: 'local',
      private: moved.private,
      baseRevision: moved.revision,
      dirty: true,
      conflict: null,
    }
    setItems([moved, fallback])
    setCurrentFile(moved)
    setEditBuffer(buffer)

    replaceItemsByPrefix('/memo/', [])

    expect(editBuffers.get(moved.id)).toEqual(buffer)
    expect(editorStore.currentFile).toEqual(moved)
    expect(editorStore.items).toEqual([fallback])
  })

  it('removes the Edit Buffer when refresh returns the same File in the recycle bin', () => {
    const active = makeFileRecord({ id: 7, path: '/memo/trashed-remotely', content: 'server', revision: 4 })
    const trashed = {
      ...active,
      revision: 5,
      deletedAt: new Date('2026-07-17T00:00:00Z'),
    }
    setItems([active])
    setCurrentFile(active)
    setEditBuffer({
      fileId: active.id,
      path: active.path,
      content: 'local',
      private: active.private,
      baseRevision: active.revision,
      dirty: true,
      conflict: null,
    })

    replaceItemsByPrefix('/memo/', [trashed])

    expect(editBuffers.has(active.id)).toBe(false)
    expect(editorStore.currentFile).toEqual(trashed)
  })
})
