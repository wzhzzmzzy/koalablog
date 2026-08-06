import type { FileRecord } from '@/db/types'

export const RECENT_FILES_STORAGE_KEY = 'koala-editor-recent-files-v1'
const RECENT_FILES_SCHEMA_VERSION = 1
const MAX_RECENT_FILE_IDS = 20

export interface RecentFilesStorage {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

function browserStorage(): RecentFilesStorage | null {
  if (typeof localStorage === 'undefined')
    return null
  return localStorage
}

function readRecentFileIds(storage: RecentFilesStorage | null) {
  if (!storage)
    return []

  try {
    const value = storage.getItem(RECENT_FILES_STORAGE_KEY)
    if (!value)
      return []
    const record = JSON.parse(value) as { schemaVersion?: unknown, fileIds?: unknown }
    if (record.schemaVersion !== RECENT_FILES_SCHEMA_VERSION || !Array.isArray(record.fileIds))
      return []
    return record.fileIds.filter((id): id is number => Number.isInteger(id) && id > 0)
  }
  catch {
    return []
  }
}

export function createRecentFiles(storage: RecentFilesStorage | null = browserStorage()) {
  let fileIds = $state([...new Set(readRecentFileIds(storage))].slice(0, MAX_RECENT_FILE_IDS))

  function persist() {
    if (!storage)
      return
    try {
      storage.setItem(RECENT_FILES_STORAGE_KEY, JSON.stringify({
        schemaVersion: RECENT_FILES_SCHEMA_VERSION,
        fileIds,
      }))
    }
    catch {
      // Browser-local recency is an enhancement and must never block editing.
    }
  }

  return {
    record(fileId: number) {
      if (!Number.isInteger(fileId) || fileId <= 0)
        return
      fileIds = [fileId, ...fileIds.filter(id => id !== fileId)].slice(0, MAX_RECENT_FILE_IDS)
      persist()
    },
    resolve(files: readonly FileRecord[]) {
      const activeFiles = new Map(files.filter(file => !file.deletedAt).map(file => [file.id, file]))
      return fileIds.flatMap((fileId) => {
        const file = activeFiles.get(fileId)
        return file ? [file] : []
      })
    },
  }
}

export const editorRecentFiles = createRecentFiles()
