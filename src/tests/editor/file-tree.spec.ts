import { buildFileTree, getTrashedFiles, isFileTreeEmpty } from '@/components/editor/file-tree'
import { drafts, editorStore, replaceItemsByPrefix, setItems } from '@/components/editor/store.svelte'
import { makeFileRecord } from '@/tests/fixtures/file-record'
import { describe, expect, it } from 'vitest'

describe('editor File tree', () => {
  it('keeps active Files in the Path tree and duplicate deleted Files in the recycle bin', () => {
    const active = makeFileRecord({ id: 1, path: '/post/active', title: 'active' })
    const older = {
      ...makeFileRecord(),
      id: 2,
      path: '/post/same',
      title: 'same',
      deletedAt: new Date('2026-07-14T10:00:00Z'),
    }
    const newer = {
      ...makeFileRecord(),
      id: 3,
      path: '/post/same',
      title: 'same',
      deletedAt: new Date('2026-07-15T10:00:00Z'),
    }

    const files = [older, active, newer]
    const tree = buildFileTree(files)
    const recycleBin = getTrashedFiles(files)

    expect(tree.children.post.items.map(item => item.id)).toEqual([active.id])
    expect(recycleBin.map(item => item.id)).toEqual([newer.id, older.id])
  })

  it('refreshes a path without confusing a deleted duplicate with the active draft', () => {
    const active = makeFileRecord({ id: 1, path: '/post/same', title: 'same', content: 'saved' })
    const deleted = {
      ...makeFileRecord(),
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

  it('projects non-root Template Prefixes before any File exists', () => {
    const tree = buildFileTree([], ['/', '/memo/project/', '/wiki/'])

    expect(tree.children.memo.children.project.fullPath).toBe('/memo/project/')
    expect(tree.children.wiki.fullPath).toBe('/wiki/')
    expect(tree.items).toEqual([])
    expect(isFileTreeEmpty(tree)).toBe(false)
  })

  it('removes Prefix nodes backed by neither Files nor Templates', () => {
    const withTemplate = buildFileTree([], ['/memo/project/'])
    const withoutTemplate = buildFileTree([], [])

    expect(withTemplate.children.memo).toBeDefined()
    expect(withoutTemplate.children.memo).toBeUndefined()
    expect(isFileTreeEmpty(withoutTemplate)).toBe(true)
  })
})
