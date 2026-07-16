import { buildDocumentTree, getTrashedDocuments } from '@/components/editor/document-tree'
import { drafts, editorStore, replaceItemsByPrefix, setItems } from '@/components/editor/store.svelte'
import { initFileRecord } from '@/db/types'
import { describe, expect, it } from 'vitest'

describe('editor document tree', () => {
  it('keeps active documents in the path tree and duplicate deleted documents in the recycle bin', () => {
    const active = { ...initFileRecord(), id: 1, path: '/post/active', title: 'active' }
    const older = {
      ...initFileRecord(),
      id: 2,
      path: '/post/same',
      title: 'same',
      deletedAt: new Date('2026-07-14T10:00:00Z'),
    }
    const newer = {
      ...initFileRecord(),
      id: 3,
      path: '/post/same',
      title: 'same',
      deletedAt: new Date('2026-07-15T10:00:00Z'),
    }

    const documents = [older, active, newer]
    const tree = buildDocumentTree(documents)
    const recycleBin = getTrashedDocuments(documents)

    expect(tree.children.post.items.map(item => item.id)).toEqual([active.id])
    expect(recycleBin.map(item => item.id)).toEqual([newer.id, older.id])
  })

  it('refreshes a path without confusing a deleted duplicate with the active draft', () => {
    const active = { ...initFileRecord(), id: 1, path: '/post/same', title: 'same', content: 'saved' }
    const deleted = {
      ...initFileRecord(),
      id: 2,
      path: '/post/same',
      title: 'same',
      content: 'deleted',
      deletedAt: new Date('2026-07-15T10:00:00Z'),
    }
    const draft = { ...active, content: 'draft' }
    drafts.clear()
    drafts.set(active.path, draft)
    setItems([active, deleted])

    replaceItemsByPrefix('/post/', [{ ...active, content: 'fresh' }, deleted])

    expect(editorStore.items.map(item => item.id).sort()).toEqual([active.id, deleted.id])
    expect(editorStore.items.find(item => item.id === active.id)).toEqual(draft)
    expect(editorStore.items.find(item => item.id === deleted.id)).toEqual(deleted)
    expect(drafts.get(active.path)).toEqual(draft)
    drafts.clear()
  })
})
