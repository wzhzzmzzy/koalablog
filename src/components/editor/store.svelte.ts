import type { FileRecord } from '@/db/types'
import { SvelteMap } from 'svelte/reactivity'

export const SIDEBAR_STORAGE_KEY = 'koala-editor-sidebar'
export const LEGACY_DRAFTS_STORAGE_KEY = 'koala-editor-drafts'
export const EDIT_BUFFERS_STORAGE_KEY = 'koala-editor-edit-buffers'

export interface EditBufferServerValues {
  path: string
  content: string | null
  private: boolean
  revision: number
}

export interface EditBuffer {
  fileId: number
  path: string
  content: string
  private: boolean
  baseRevision: number
  dirty: boolean
  conflict: { server: EditBufferServerValues } | null
}

interface EditBufferStorage {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
}

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

export const editBuffers = new SvelteMap<number, EditBuffer>()

function browserStorage(): EditBufferStorage | null {
  return typeof localStorage === 'undefined' ? null : localStorage
}

function editBufferFromLegacy(file: FileRecord, legacy: FileRecord): EditBuffer | null {
  if (legacy.id > 0 && legacy.id !== file.id)
    return null

  const buffer: EditBuffer = {
    fileId: file.id,
    path: legacy.path,
    content: legacy.content ?? '',
    private: legacy.private,
    baseRevision: legacy.revision,
    dirty: legacy.path !== file.path
      || (legacy.content ?? '') !== (file.content ?? '')
      || legacy.private !== file.private,
    conflict: null,
  }
  return buffer.dirty ? buffer : null
}

function legacyFileRecord(input: unknown): FileRecord | null {
  if (!input || typeof input !== 'object')
    return null
  const value = input as Record<string, unknown>
  if (!Number.isInteger(value.id)
    || (value.id as number) < 0
    || typeof value.path !== 'string'
    || (typeof value.content !== 'string' && value.content !== null && value.content !== undefined)
    || typeof value.private !== 'boolean'
    || !Number.isInteger(value.revision)
    || (value.revision as number) < 1) {
    return null
  }
  return value as unknown as FileRecord
}

function storedServerValues(input: unknown): EditBufferServerValues | null {
  if (!input || typeof input !== 'object')
    return null
  const value = input as Record<string, unknown>
  if (typeof value.path !== 'string'
    || (typeof value.content !== 'string' && value.content !== null)
    || typeof value.private !== 'boolean'
    || !Number.isInteger(value.revision)
    || (value.revision as number) < 1) {
    return null
  }
  return value as unknown as EditBufferServerValues
}

function storedEditBuffer(input: unknown): EditBuffer | null {
  if (!input || typeof input !== 'object')
    return null
  const value = input as Record<string, unknown>
  if (!Number.isInteger(value.fileId)
    || (value.fileId as number) < 1
    || typeof value.path !== 'string'
    || typeof value.content !== 'string'
    || typeof value.private !== 'boolean'
    || !Number.isInteger(value.baseRevision)
    || (value.baseRevision as number) < 1
    || typeof value.dirty !== 'boolean') {
    return null
  }
  if (value.conflict !== null) {
    if (!value.conflict || typeof value.conflict !== 'object')
      return null
    const server = storedServerValues((value.conflict as Record<string, unknown>).server)
    if (!server)
      return null
    value.conflict = { server }
  }
  return value as unknown as EditBuffer
}

function restoreStoredEditBuffers(files: FileRecord[], storage: EditBufferStorage) {
  const stored = storage.getItem(EDIT_BUFFERS_STORAGE_KEY)
  if (!stored)
    return false
  try {
    const value = JSON.parse(stored) as { schemaVersion?: unknown, buffers?: unknown }
    if (value.schemaVersion !== 1 || !Array.isArray(value.buffers))
      return false
    const activeIds = new Set(files.filter(file => !file.deletedAt).map(file => file.id))
    for (const candidate of value.buffers) {
      const buffer = storedEditBuffer(candidate)
      if (buffer && activeIds.has(buffer.fileId) && (buffer.dirty || buffer.conflict))
        editBuffers.set(buffer.fileId, buffer)
    }
    return true
  }
  catch {
    return false
  }
}

export function persistEditBuffers(storage: EditBufferStorage | null = browserStorage()) {
  if (!storage)
    return
  storage.setItem(EDIT_BUFFERS_STORAGE_KEY, JSON.stringify({
    schemaVersion: 1,
    buffers: Array.from(editBuffers.values()),
  }))
}

export function initializeEditBuffers(files: FileRecord[], storage: EditBufferStorage | null = browserStorage()) {
  editBuffers.clear()
  if (!storage)
    return

  const restored = restoreStoredEditBuffers(files, storage)
  const storedLegacy = restored ? null : storage.getItem(LEGACY_DRAFTS_STORAGE_KEY)
  if (storedLegacy) {
    try {
      const entries = JSON.parse(storedLegacy) as unknown
      if (Array.isArray(entries)) {
        const counts = new Map<string, number>()
        for (const entry of entries) {
          if (Array.isArray(entry) && typeof entry[0] === 'string')
            counts.set(entry[0], (counts.get(entry[0]) ?? 0) + 1)
        }

        for (const entry of entries) {
          if (!Array.isArray(entry) || typeof entry[0] !== 'string' || !entry[1] || typeof entry[1] !== 'object')
            continue
          const path = entry[0]
          const legacy = legacyFileRecord(entry[1])
          if (!legacy)
            continue
          if (counts.get(path) !== 1)
            continue
          const activeMatches = files.filter(file => !file.deletedAt && file.path === path)
          if (activeMatches.length !== 1)
            continue
          const buffer = editBufferFromLegacy(activeMatches[0], legacy)
          if (buffer)
            editBuffers.set(buffer.fileId, buffer)
        }
      }
    }
    catch {
      // Invalid legacy state is discarded rather than attached to the wrong File.
    }
  }

  storage.removeItem(LEGACY_DRAFTS_STORAGE_KEY)
  persistEditBuffers(storage)
}

export function setEditBuffer(buffer: EditBuffer) {
  const current = editBuffers.get(buffer.fileId)
  if (current && JSON.stringify(current) === JSON.stringify(buffer))
    return
  editBuffers.set(buffer.fileId, buffer)
}

export function removeEditBuffer(fileId: number) {
  editBuffers.delete(fileId)
}

function serverValues(file: FileRecord): EditBufferServerValues {
  return {
    path: file.path,
    content: file.content ?? null,
    private: file.private,
    revision: file.revision,
  }
}

export function reconcileEditBuffer(file: FileRecord) {
  const buffer = editBuffers.get(file.id)
  if (!buffer)
    return
  if (!buffer.dirty) {
    removeEditBuffer(file.id)
    return
  }
  if (file.revision > buffer.baseRevision) {
    setEditBuffer({
      ...buffer,
      conflict: { server: serverValues(file) },
    })
  }
}

// Hook to enable auto-persistence
export function useEditorPersistence() {
  $effect(() => {
    Array.from(editBuffers.entries())
    persistEditBuffers()
  })

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

export function setItems(newItems: FileRecord[]) {
  const newIds = new Set(newItems.map(item => item.id))
  for (const fileId of editBuffers.keys()) {
    const file = newItems.find(item => item.id === fileId)
    if (!newIds.has(fileId) || file?.deletedAt)
      removeEditBuffer(fileId)
  }
  for (const file of newItems) {
    if (!file.deletedAt)
      reconcileEditBuffer(file)
  }
  editorStore.items = newItems
  editorStore.hasAttemptedLoad = true
  if (editorStore.currentFile) {
    editorStore.currentFile = newItems.find(item => item.id === editorStore.currentFile!.id)
    ?? newItems.find(item => !item.deletedAt)
    ?? null
  }
}

function isWithinPrefix(path: string, prefix: string) {
  return prefix === '/' || path.startsWith(prefix)
}

export function replaceItemsByPrefix(prefix: string, freshItems: FileRecord[]) {
  const existingInScope = editorStore.items.filter(item => isWithinPrefix(item.path, prefix))
  const freshIds = new Set(freshItems.map(item => item.id))
  const isAuthoritativeRefresh = prefix === '/'
  if (isAuthoritativeRefresh) {
    for (const item of existingInScope) {
      if (!freshIds.has(item.id))
        removeEditBuffer(item.id)
    }
  }
  for (const item of freshItems) {
    if (item.deletedAt)
      removeEditBuffer(item.id)
    else
      reconcileEditBuffer(item)
  }

  editorStore.items = [
    ...editorStore.items.filter(item => !isWithinPrefix(item.path, prefix)),
    ...freshItems,
  ]

  if (editorStore.currentFile) {
    const current = editorStore.items.find(item => item.id === editorStore.currentFile!.id)
    if (current)
      editorStore.currentFile = current
    else if (isAuthoritativeRefresh)
      editorStore.currentFile = editorStore.items.find(item => !item.deletedAt) ?? null
  }
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
