import type { FileRecord } from '@/db/types'
import { SvelteMap } from 'svelte/reactivity'

export const SIDEBAR_STORAGE_KEY = 'koala-editor-sidebar'
export const DRAFTS_STORAGE_KEY = 'koala-editor-drafts'

function getStoredSidebar() {
  if (typeof localStorage === 'undefined')
    return true
  const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY)
  return stored === null ? true : stored === 'true'
}

function getStoredDrafts(): [string, FileRecord][] {
  if (typeof localStorage === 'undefined')
    return []
  const stored = localStorage.getItem(DRAFTS_STORAGE_KEY)
  if (!stored)
    return []
  try {
    return JSON.parse(stored)
  }
  catch {
    return []
  }
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

export const drafts = new SvelteMap<string, FileRecord>(getStoredDrafts())

// Hook to enable auto-persistence
export function useEditorPersistence() {
  $effect(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(Array.from(drafts.entries())))
    }
  })

  $effect(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(editorStore.showSidebar))
    }
  })
}

export function setDraft(path: string, file: FileRecord) {
  drafts.set(path, file)
}

export function removeDraft(path: string) {
  drafts.delete(path)
}

export function setShowSidebar(show: boolean) {
  editorStore.showSidebar = show
}

export function toggleSidebar() {
  editorStore.showSidebar = !editorStore.showSidebar
}

export function setItems(newItems: FileRecord[]) {
  editorStore.items = newItems
  editorStore.hasAttemptedLoad = true
}

function isWithinPrefix(path: string, prefix: string) {
  return prefix === '/' || path.startsWith(prefix)
}

export function replaceItemsByPrefix(prefix: string, freshItems: FileRecord[]) {
  const preservedDraftItems = editorStore.items
    .filter(item => !item.deletedAt && isWithinPrefix(item.path, prefix) && drafts.has(item.path))
    .map(item => drafts.get(item.path) ?? item)

  const preservedDraftIds = new Set(preservedDraftItems.map(item => item.id))
  const nextItems = freshItems.filter(item => (item.deletedAt || !drafts.has(item.path)) && !preservedDraftIds.has(item.id))

  editorStore.items = [
    ...editorStore.items.filter(item => !isWithinPrefix(item.path, prefix)),
    ...nextItems,
    ...preservedDraftItems,
  ]
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
  editorStore.items = editorStore.items.filter(item => item.id !== id)
}

export function removeTrashedItems() {
  editorStore.items = editorStore.items.filter(item => !item.deletedAt)
}
