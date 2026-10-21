import type { FileRecord } from '@/db/types'
import type { RendererMode } from '@/lib/files/types'
import { SvelteMap } from 'svelte/reactivity'
import { isRendererMode } from '@/lib/files/types'

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
// Old formats need the authoritative File's Renderer/identity before migration.
// Keep unloaded entries inert and persisted until that File is actually read.
let pendingLegacyBuffers: unknown[] = []
let pendingLegacyDrafts: unknown[] = []

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

function restoreBufferCandidates(candidates: unknown[], files: FileRecord[], legacy: boolean, authoritative: boolean) {
  const filesById = new Map(files.map(file => [file.id, file]))
  for (const candidate of candidates) {
    const fileId = candidate && typeof candidate === 'object'
      ? (candidate as Record<string, unknown>).fileId
      : null
    if (!Number.isInteger(fileId))
      continue
    const file = filesById.get(fileId as number)
    if (file?.deletedAt || files.filter(item => item.id === fileId).length > 1)
      continue
    if (!file && authoritative)
      continue
    if (!file && legacy) {
      pendingLegacyBuffers.push(candidate)
      continue
    }
    const buffer = storedEditBuffer(candidate, legacy ? file?.renderer : undefined)
    if (buffer && (buffer.dirty || buffer.conflict))
      editBuffers.set(buffer.fileId, buffer)
  }
}

function restoreStoredEditBuffers(files: FileRecord[], storage: EditBufferStorage, authoritative: boolean) {
  const stored = storage.getItem(EDIT_BUFFERS_STORAGE_KEY)
  if (!stored)
    return false
  try {
    const value = JSON.parse(stored) as { schemaVersion?: unknown, buffers?: unknown, pendingLegacyBuffers?: unknown, pendingLegacyDrafts?: unknown }
    if ((value.schemaVersion !== 1 && value.schemaVersion !== 2) || !Array.isArray(value.buffers))
      return false
    if (Array.isArray(value.pendingLegacyBuffers))
      restoreBufferCandidates(value.pendingLegacyBuffers, files, true, authoritative)
    restoreBufferCandidates(value.buffers, files, value.schemaVersion === 1, authoritative)
    if (Array.isArray(value.pendingLegacyDrafts))
      restoreLegacyDrafts(value.pendingLegacyDrafts, files, authoritative)
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
    ...(pendingLegacyBuffers.length ? { pendingLegacyBuffers } : {}),
    ...(pendingLegacyDrafts.length ? { pendingLegacyDrafts } : {}),
  }))
}

function restoreLegacyDrafts(entries: unknown[], files: FileRecord[], authoritative: boolean) {
  const counts = new Map<string, number>()
  for (const entry of entries) {
    if (Array.isArray(entry) && typeof entry[0] === 'string')
      counts.set(entry[0], (counts.get(entry[0]) ?? 0) + 1)
  }
  for (const entry of entries) {
    if (!Array.isArray(entry) || typeof entry[0] !== 'string')
      continue
    const path = entry[0]
    const legacy = legacyFileRecord(entry[1])
    if (!legacy || counts.get(path) !== 1)
      continue
    const matches = files.filter(file => !file.deletedAt && file.path === path)
    if (matches.length !== 1) {
      if (!authoritative && matches.length === 0 && !files.some(file => file.id === legacy.id))
        pendingLegacyDrafts.push(entry)
      continue
    }
    const buffer = editBufferFromLegacy(matches[0], legacy)
    if (buffer && !editBuffers.has(buffer.fileId))
      editBuffers.set(buffer.fileId, buffer)
  }
}

export function initializeEditBuffers(files: FileRecord[], storage: EditBufferStorage | null = browserStorage(), authoritative = true) {
  editBuffers.clear()
  pendingLegacyBuffers = []
  pendingLegacyDrafts = []
  if (!storage)
    return

  const restored = restoreStoredEditBuffers(files, storage, authoritative)
  const storedLegacy = restored ? null : storage.getItem(LEGACY_DRAFTS_STORAGE_KEY)
  if (storedLegacy) {
    try {
      const entries = JSON.parse(storedLegacy) as unknown
      if (Array.isArray(entries))
        restoreLegacyDrafts(entries, files, authoritative)
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
  pendingLegacyBuffers = pendingLegacyBuffers.filter(entry => (entry as { fileId?: number })?.fileId !== fileId)
  pendingLegacyDrafts = pendingLegacyDrafts.filter(entry => !Array.isArray(entry) || entry[1]?.id !== fileId)
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
  const pendingBuffers = pendingLegacyBuffers
  const pendingDrafts = pendingLegacyDrafts
  pendingLegacyBuffers = []
  pendingLegacyDrafts = []
  restoreBufferCandidates(pendingBuffers, [file], true, false)
  restoreLegacyDrafts(pendingDrafts, [file], false)
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
