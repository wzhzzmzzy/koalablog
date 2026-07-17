import type { FileRecord } from '@/db/types'
import { editBuffers, reconcileEditBuffer, removeEditBuffer } from './edit-buffer.svelte'

export const SIDEBAR_STORAGE_KEY = 'koala-editor-sidebar'

function getStoredSidebar() {
  if (typeof localStorage === 'undefined')
    return true
  const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY)
  return stored === null ? true : stored === 'true'
}

export const editorStore = $state<{
  items: FileRecord[]
  currentFile: FileRecord | null
  loading: boolean
  hasAttemptedLoad: boolean
  history: string[]
  showSidebar: boolean
}>({
  items: [],
  currentFile: null,
  loading: false,
  hasAttemptedLoad: false,
  history: [],
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

export function useSidebarPersistence() {
  $effect(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(editorStore.showSidebar))
    }
  })
}

export function setShowSidebar(show: boolean) {
  editorStore.showSidebar = show
}

export function toggleSidebar() {
  editorStore.showSidebar = !editorStore.showSidebar
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

export function setItems(newItems: FileRecord[]) {
  applyServerItems(newItems, newItems, true)
  editorStore.hasAttemptedLoad = true
}

function isWithinPrefix(path: string, prefix: string) {
  return prefix === '/' || path.startsWith(prefix)
}

export function replaceItemsByPrefix(prefix: string, freshItems: FileRecord[]) {
  const isAuthoritativeRefresh = prefix === '/'
  const nextItems = [
    ...editorStore.items.filter(item => !isWithinPrefix(item.path, prefix)),
    ...freshItems,
  ]
  applyServerItems(nextItems, freshItems, isAuthoritativeRefresh)
}

export function setCurrentFile(file: FileRecord | null) {
  editorStore.currentFile = file
}

export function pushHistory(path: string) {
  const last = editorStore.history[editorStore.history.length - 1]
  if (last !== path) {
    editorStore.history.push(path)
  }
}

export function popHistory() {
  return editorStore.history.pop()
}

export function updateLastHistory(path: string) {
  if (editorStore.history.length > 0) {
    editorStore.history[editorStore.history.length - 1] = path
  }
}

export function upsertItem(item: FileRecord) {
  const index = editorStore.items.findIndex(i => i.id === item.id)
  if (index >= 0) {
    editorStore.items[index] = item
  }
  else {
    editorStore.items = [item, ...editorStore.items]
  }
}

export function removeItem(id: number) {
  removeEditBuffer(id)
  editorStore.items = editorStore.items.filter(item => item.id !== id)
}

export function removeTrashedItems() {
  for (const item of editorStore.items) {
    if (item.deletedAt)
      removeEditBuffer(item.id)
  }
  editorStore.items = editorStore.items.filter(item => !item.deletedAt)
}
