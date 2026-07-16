import { buildDocumentTree, getTrashedDocuments } from '@/components/editor/document-tree'
import { drafts, editorStore, replaceItemsByPrefix, setItems } from '@/components/editor/store.svelte'
import { initMarkdown } from '@/db/types'
import { describe, expect, it } from 'vitest'

describe('editor document tree', () => {
  it('keeps active documents in the path tree and duplicate deleted documents in the recycle bin', () => {
    const active = { ...initMarkdown(), id: 1, link: 'post/active', subject: 'Active' }
    const older = {
      ...initMarkdown(),
      id: 2,
      link: 'post/same',
      subject: 'Same',
      deletedAt: new Date('2026-07-14T10:00:00Z'),
    }
    const newer = {
      ...initMarkdown(),
      id: 3,
      link: 'post/same',
      subject: 'Same',
      deletedAt: new Date('2026-07-15T10:00:00Z'),
    }

    const documents = [older, active, newer]
    const tree = buildDocumentTree(documents)
    const recycleBin = getTrashedDocuments(documents)

    expect(tree.children.post.items.map(item => item.id)).toEqual([active.id])
    expect(recycleBin.map(item => item.id)).toEqual([newer.id, older.id])
  })

  it('refreshes a path without confusing a deleted duplicate with the active draft', () => {
    const active = { ...initMarkdown(), id: 1, link: 'post/same', subject: 'Same', content: 'saved' }
    const deleted = {
      ...initMarkdown(),
      id: 2,
      link: 'post/same',
      subject: 'Same',
      content: 'deleted',
      deletedAt: new Date('2026-07-15T10:00:00Z'),
    }
    const draft = { ...active, content: 'draft' }
    drafts.clear()
    drafts.set(active.link, draft)
    setItems([active, deleted])

    replaceItemsByPrefix('post/', [{ ...active, content: 'fresh' }, deleted])

    expect(editorStore.items).toEqual([draft, deleted])
    expect(drafts.get(active.link)).toEqual(draft)
    drafts.clear()
  })
})
