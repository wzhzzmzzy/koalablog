import type { EditorFileCounts, EditorPrefixListing } from '@/db/editor'
import type { FileRecord } from '@/db/types'
import type { AbsolutePathPrefix } from '@/lib/files/types'
import { editBuffers, reconcileEditBuffer, removeEditBuffer } from './edit-buffer.svelte'

// v1 also stored automatic mobile/narrow-screen closes, so its boolean could not
// distinguish a layout response from an explicit user preference.
export const SIDEBAR_STORAGE_KEY = 'koala-editor-sidebar-v2'

function getStoredSidebar() {
  if (typeof localStorage === 'undefined')
    return true
  const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY)
  return stored === null ? true : stored === 'true'
}

export const editorStore = $state<{
  items: FileRecord[]
  prefixesByParent: Record<string, AbsolutePathPrefix[]>
  counts: EditorFileCounts
  currentFile: FileRecord | null
  loading: boolean
  hasAttemptedLoad: boolean
  showSidebar: boolean
}>({
  items: [],
  prefixesByParent: {},
  counts: { active: 0, trash: 0 },
  currentFile: null,
  loading: false,
  hasAttemptedLoad: false,
  showSidebar: getStoredSidebar(),
})

export const notifyStore = $state<{
  text: string
  type: 'info' | 'success' | 'error' | 'warning'
}>({
  text: '',
  type: 'info',
})

let notifyTimer: NodeJS.Timeout

export function notify(type: 'info' | 'success' | 'error' | 'warning', text: string, timeout = 2000) {
  notifyStore.type = type
  notifyStore.text = text

  if (notifyTimer)
    clearTimeout(notifyTimer)

  if (timeout > 0) {
    notifyTimer = setTimeout(() => {
      notifyStore.text = ''
    }, timeout)
  }
}

export function hasStoredSidebarPreference() {
  return typeof localStorage !== 'undefined' && localStorage.getItem(SIDEBAR_STORAGE_KEY) !== null
}

export function setShowSidebar(show: boolean) {
  editorStore.showSidebar = show
}

export function toggleSidebar() {
  const show = !editorStore.showSidebar
  editorStore.showSidebar = show
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, String(show))
  }
}

function applyServerItems(nextItems: FileRecord[], refreshedItems: FileRecord[], authoritative: boolean) {
  if (authoritative) {
    const nextIds = new Set(nextItems.map(item => item.id))
    for (const fileId of editBuffers.keys()) {
      if (!nextIds.has(fileId))
        removeEditBuffer(fileId)
    }
  }

  for (const file of refreshedItems) {
    if (file.deletedAt)
      removeEditBuffer(file.id)
    else
      reconcileEditBuffer(file)
  }

  editorStore.items = nextItems
  if (editorStore.currentFile) {
    const current = nextItems.find(item => item.id === editorStore.currentFile!.id)
    if (current)
      editorStore.currentFile = current
    else if (authoritative)
      editorStore.currentFile = nextItems.find(item => !item.deletedAt) ?? null
  }
}

export function setItems(newItems: FileRecord[], authoritative = true) {
  applyServerItems(newItems, newItems, authoritative)
  editorStore.hasAttemptedLoad = true
}

function isWithinPrefixRefreshScope(path: string, prefix: string) {
  if (!path.startsWith(prefix))
    return false

  const relativePath = path.slice(prefix.length)
  return relativePath.length > 0 && !relativePath.includes('/')
}

export function replaceItemsByPrefix(prefix: string, freshItems: FileRecord[]) {
  const freshIds = new Set(freshItems.map(item => item.id))
  const nextItems = [
    ...editorStore.items.filter(item => !freshIds.has(item.id) && !isWithinPrefixRefreshScope(item.path, prefix)),
    ...freshItems,
  ]
  applyServerItems(nextItems, freshItems, false)
}

export function initializeWorkspace(listing: EditorPrefixListing, selected: FileRecord | null, counts: EditorFileCounts) {
  const items = selected && !listing.files.some(file => file.id === selected.id)
    ? [...listing.files, selected]
    : listing.files
  editorStore.currentFile = null
  editorStore.prefixesByParent = { [listing.prefix]: listing.prefixes }
  editorStore.counts = counts
  // A one-level response says nothing about buffers in unopened Prefixes.
  setItems(items, false)
  setCurrentFile(selected)
}

export function replacePrefixListing(listing: EditorPrefixListing) {
  const previous = editorStore.prefixesByParent[listing.prefix] ?? []
  const removed = previous.filter(prefix => !listing.prefixes.includes(prefix))
  if (removed.length) {
    editorStore.items = editorStore.items.filter(item => item.deletedAt || !removed.some(prefix => item.path.startsWith(prefix)))
    for (const prefix of Object.keys(editorStore.prefixesByParent)) {
      if (removed.some(parent => prefix.startsWith(parent)))
        delete editorStore.prefixesByParent[prefix]
    }
  }
  editorStore.prefixesByParent[listing.prefix] = listing.prefixes
  // Recycle-bin records are loaded separately, never removed by a live listing.
  const recycled = editorStore.items.filter(item => item.deletedAt && isWithinPrefixRefreshScope(item.path, listing.prefix))
  replaceItemsByPrefix(listing.prefix, [...listing.files, ...recycled])
}

export function replaceTrashItems(files: FileRecord[], counts: EditorFileCounts) {
  const trashIds = new Set(files.map(file => file.id))
  const next = [...editorStore.items.filter(file => !file.deletedAt && !trashIds.has(file.id)), ...files]
  applyServerItems(next, files, false)
  editorStore.counts = counts
}

export function cacheEditorFiles(files: FileRecord[]) {
  for (const file of files) {
    const current = editorStore.items.find(item => item.id === file.id)
    if (current && current.revision > file.revision)
      continue
    upsertItem(file, false)
    if (file.deletedAt)
      removeEditBuffer(file.id)
    else
      reconcileEditBuffer(file)
  }
}

export function setCurrentFile(file: FileRecord | null) {
  editorStore.currentFile = file
}

export function upsertItem(item: FileRecord, countChange = true) {
  const previous = editorStore.items.find(file => file.id === item.id)
  const replaced = !item.deletedAt && editorStore.items.find(file => file.id !== item.id && !file.deletedAt && file.path === item.path)
  if (countChange) {
    editorStore.counts.active += Number(!item.deletedAt) - Number(Boolean(previous && !previous.deletedAt)) - Number(Boolean(replaced))
    editorStore.counts.trash += Number(Boolean(item.deletedAt)) - Number(Boolean(previous?.deletedAt)) + Number(Boolean(replaced))
  }
  if (!item.deletedAt) {
    // A saved move/create can introduce a child under an already loaded Prefix.
    // Reveal that next segment without pretending its contents were loaded.
    for (const [prefix, children] of Object.entries(editorStore.prefixesByParent)) {
      if (!item.path.startsWith(prefix))
        continue
      const relativePath = item.path.slice(prefix.length)
      const separator = relativePath.indexOf('/')
      if (separator < 0)
        continue
      const child = `${prefix}${relativePath.slice(0, separator + 1)}` as AbsolutePathPrefix
      if (!children.includes(child))
        editorStore.prefixesByParent[prefix] = [...children, child].sort()
    }
    for (const existing of editorStore.items) {
      if (existing.id !== item.id && !existing.deletedAt && existing.path === item.path)
        removeEditBuffer(existing.id)
    }
    editorStore.items = editorStore.items.filter(existing => existing.id === item.id || existing.deletedAt || existing.path !== item.path)
  }
  const index = editorStore.items.findIndex(i => i.id === item.id)
  if (index >= 0) {
    editorStore.items[index] = item
  }
  else {
    editorStore.items = [item, ...editorStore.items]
  }
}

export function removeItem(id: number) {
  const item = editorStore.items.find(file => file.id === id)
  if (item)
    editorStore.counts[item.deletedAt ? 'trash' : 'active'] = Math.max(0, editorStore.counts[item.deletedAt ? 'trash' : 'active'] - 1)
  removeEditBuffer(id)
  editorStore.items = editorStore.items.filter(item => item.id !== id)
}

export function removeTrashedItems() {
  editorStore.counts.trash = 0
  for (const item of editorStore.items) {
    if (item.deletedAt)
      removeEditBuffer(item.id)
  }
  editorStore.items = editorStore.items.filter(item => !item.deletedAt)
}
