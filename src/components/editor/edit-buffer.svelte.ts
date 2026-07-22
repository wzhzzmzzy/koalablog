import type { FileRecord } from '@/db/types'
import type { RendererMode } from '@/lib/files/types'
import { isRendererMode } from '@/lib/files/types'
import { SvelteMap } from 'svelte/reactivity'

export const LEGACY_DRAFTS_STORAGE_KEY = 'koala-editor-drafts'
export const EDIT_BUFFERS_STORAGE_KEY = 'koala-editor-edit-buffers'

export interface EditBufferServerValues {
  path: string
  renderer: RendererMode
  content: string
  private: boolean
  revision: number
}

export interface EditBuffer {
  fileId: number
  path: string
  renderer: RendererMode
  content: string
  private: boolean
  baseRevision: number
  dirty: boolean
  conflict: { server: EditBufferServerValues } | null
}

export interface EditBufferStorage {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
}

export const editBuffers = new SvelteMap<number, EditBuffer>()

type EditableFileValues = Pick<EditBuffer, 'path' | 'renderer' | 'content' | 'private'>
type ServerFileValues = Pick<FileRecord, 'path' | 'renderer' | 'content' | 'private'>

interface LegacyDraftRecord {
  id: number
  path: string
  content: string | null | undefined
  private: boolean
  revision: number
}

function browserStorage(): EditBufferStorage | null {
  return typeof localStorage === 'undefined' ? null : localStorage
}

export function isEditBufferDirty(local: EditableFileValues, server: ServerFileValues): boolean {
  return local.path !== server.path
    || local.renderer !== server.renderer
    || local.content !== server.content
    || local.private !== server.private
}

function editBufferFromLegacy(file: FileRecord, legacy: LegacyDraftRecord): EditBuffer | null {
  if (legacy.id > 0 && legacy.id !== file.id)
    return null

  const buffer: EditBuffer = {
    fileId: file.id,
    path: legacy.path,
    renderer: file.renderer,
    content: legacy.content ?? '',
    private: legacy.private,
    baseRevision: legacy.revision,
    dirty: false,
    conflict: null,
  }
  buffer.dirty = isEditBufferDirty(buffer, file)
  return buffer.dirty ? buffer : null
}

function legacyFileRecord(input: unknown): LegacyDraftRecord | null {
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
  return value as unknown as LegacyDraftRecord
}

function storedServerValues(input: unknown, legacyRenderer?: RendererMode): EditBufferServerValues | null {
  if (!input || typeof input !== 'object')
    return null
  const value = input as Record<string, unknown>
  const renderer = legacyRenderer ?? (isRendererMode(value.renderer) ? value.renderer : undefined)
  if (typeof value.path !== 'string'
    || !renderer
    || (typeof value.content !== 'string' && !(legacyRenderer && value.content === null))
    || typeof value.private !== 'boolean'
    || !Number.isInteger(value.revision)
    || (value.revision as number) < 1) {
    return null
  }
  return {
    path: value.path,
    renderer,
    content: typeof value.content === 'string' ? value.content : '',
    private: value.private,
    revision: value.revision as number,
  }
}

function storedEditBuffer(input: unknown, legacyRenderer?: RendererMode): EditBuffer | null {
  if (!input || typeof input !== 'object')
    return null
  const value = input as Record<string, unknown>
  const renderer = legacyRenderer ?? (isRendererMode(value.renderer) ? value.renderer : undefined)
  if (!Number.isInteger(value.fileId)
    || (value.fileId as number) < 1
    || typeof value.path !== 'string'
    || !renderer
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
    const server = storedServerValues((value.conflict as Record<string, unknown>).server, legacyRenderer)
    if (!server)
      return null
    value.conflict = { server }
  }
  return { ...value, renderer } as unknown as EditBuffer
}

function restoreStoredEditBuffers(files: FileRecord[], storage: EditBufferStorage) {
  const stored = storage.getItem(EDIT_BUFFERS_STORAGE_KEY)
  if (!stored)
    return false
  try {
    const value = JSON.parse(stored) as { schemaVersion?: unknown, buffers?: unknown }
    if ((value.schemaVersion !== 1 && value.schemaVersion !== 2) || !Array.isArray(value.buffers))
      return false
    const activeFilesById = new Map<number, FileRecord[]>()
    for (const file of files.filter(file => !file.deletedAt))
      activeFilesById.set(file.id, [...(activeFilesById.get(file.id) ?? []), file])

    for (const candidate of value.buffers) {
      const fileId = candidate && typeof candidate === 'object'
        ? (candidate as Record<string, unknown>).fileId
        : null
      const matches = Number.isInteger(fileId) ? activeFilesById.get(fileId as number) : undefined
      if (matches?.length !== 1)
        continue
      const buffer = storedEditBuffer(candidate, value.schemaVersion === 1 ? matches[0].renderer : undefined)
      if (buffer && (buffer.dirty || buffer.conflict))
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
    schemaVersion: 2,
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
          if (!legacy || counts.get(path) !== 1)
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

  persistEditBuffers(storage)
  storage.removeItem(LEGACY_DRAFTS_STORAGE_KEY)
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

export function editBufferServerValues(file: FileRecord): EditBufferServerValues {
  return {
    path: file.path,
    renderer: file.renderer,
    content: file.content,
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
      conflict: { server: editBufferServerValues(file) },
    })
  }
}

export function useEditBufferPersistence() {
  $effect(() => {
    Array.from(editBuffers.entries())
    persistEditBuffers()
  })
}
