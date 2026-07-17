import { buildFileTree, getTrashedFiles, isFileTreeEmpty } from '@/components/editor/file-tree'
import { editBuffers, editorStore, replaceItemsByPrefix, setEditBuffer, setItems } from '@/components/editor/store.svelte'
import { parseAbsolutePathPrefix } from '@/lib/files/path'
import { makeFileRecord } from '@/tests/fixtures/file-record'
import { describe, expect, it } from 'vitest'

function prefix(input: string) {
  const parsed = parseAbsolutePathPrefix(input)
  if (!parsed.ok)
    throw new Error(`Invalid test Prefix: ${input}`)
  return parsed.value
}

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

  it('refreshes a Path without confusing a deleted duplicate with the active Edit Buffer', () => {
    const active = makeFileRecord({ id: 1, path: '/post/same', title: 'same', content: 'saved' })
    const deleted = {
      ...makeFileRecord(),
      id: 2,
      path: '/post/same',
      title: 'same',
      content: 'deleted',
      deletedAt: new Date('2026-07-15T10:00:00Z'),
    }
    editBuffers.clear()
    setEditBuffer({
      fileId: active.id,
      path: active.path,
      content: 'local',
      private: active.private,
      baseRevision: active.revision,
      dirty: true,
      conflict: null,
    })
    setItems([active, deleted])

    replaceItemsByPrefix('/post/', [{ ...active, content: 'fresh' }, deleted])

    expect(editorStore.items.map(item => item.id).sort()).toEqual([active.id, deleted.id])
    expect(editorStore.items.find(item => item.id === active.id)?.content).toBe('fresh')
    expect(editorStore.items.find(item => item.id === deleted.id)).toEqual(deleted)
    expect(editBuffers.get(active.id)?.content).toBe('local')
    editBuffers.clear()
  })

  it('projects non-root Template Prefixes before any File exists', () => {
    const tree = buildFileTree([], [prefix('/'), prefix('/memo/project/'), prefix('/wiki/')])

    expect(tree.children.memo.children.project.prefix).toBe('/memo/project/')
    expect(tree.children.wiki.prefix).toBe('/wiki/')
    expect(tree.items).toEqual([])
    expect(isFileTreeEmpty(tree)).toBe(false)
  })

  it('removes Prefix nodes backed by neither Files nor Templates', () => {
    const withTemplate = buildFileTree([], [prefix('/memo/project/')])
    const withoutTemplate = buildFileTree([], [])

    expect(withTemplate.children.memo).toBeDefined()
    expect(withoutTemplate.children.memo).toBeUndefined()
    expect(isFileTreeEmpty(withoutTemplate)).toBe(true)
  })
})
