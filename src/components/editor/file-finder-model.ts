import type { EditBuffer } from './edit-buffer.svelte'
import type { FileRecord } from '@/db/types'

const LOCAL_CHANGES_LIMIT = 8
const RECENT_FILES_LIMIT = 12

export interface FileFinderEmptyGroups {
  localChanges: FileRecord[]
  recent: FileRecord[]
}

function titleFromPath(path: string) {
  return path.split('/').filter(Boolean).at(-1) ?? ''
}

function localChangeValues(file: FileRecord, buffer: EditBuffer): FileRecord {
  return {
    ...file,
    path: buffer.path,
    title: titleFromPath(buffer.path),
    renderer: buffer.renderer,
    content: buffer.content,
    private: buffer.private,
  }
}

export function emptyFileFinderGroups(
  files: readonly FileRecord[],
  buffers: Pick<Map<number, EditBuffer>, 'get'>,
  recentFiles: readonly FileRecord[],
): FileFinderEmptyGroups {
  const activeFiles = files.filter(file => !file.deletedAt)
  const localChanges = activeFiles.flatMap((file) => {
    const buffer = buffers.get(file.id)
    return buffer?.dirty || buffer?.conflict
      ? [localChangeValues(file, buffer)]
      : []
  }).slice(0, LOCAL_CHANGES_LIMIT)
  const localIds = new Set(localChanges.map(file => file.id))
  const activeById = new Map(activeFiles.map(file => [file.id, file]))
  const recent: FileRecord[] = []
  const seen = new Set<number>()

  for (const recentFile of recentFiles) {
    if (recent.length >= RECENT_FILES_LIMIT)
      break
    const id = recentFile.id
    if (seen.has(id) || localIds.has(id))
      continue
    seen.add(id)
    const file = activeById.get(id)
    if (file)
      recent.push(file)
  }

  return { localChanges, recent }
}
