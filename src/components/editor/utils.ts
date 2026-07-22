import type { FileRecord } from '@/db/types'
import { convertToWebP, uploadFile } from '@/lib/services/file-reader'

export async function uploadEditorImage(file: File) {
  const blob = await convertToWebP(file)
  const extension = blob.type === 'image/webp' ? '.webp' : '.png'
  const fileName = file.name.replace(/\.[^/.]+$/, extension)
  const result = await uploadFile('article', blob, fileName)

  if (result.error)
    throw new Error(result.error.message)
  if (!result.data)
    throw new Error('Upload failed')

  const [source, key] = result.data.split('/')
  return { url: `/api/oss/${source}_${key}` }
}

export function formatActionError(message: string) {
  const prefix = 'Failed to validate: '
  if (!message?.startsWith(prefix))
    return message

  try {
    const errors = JSON.parse(message.slice(prefix.length))
    if (!Array.isArray(errors))
      return message

    const fieldNames: Record<string, string> = {
      path: 'File Path',
      content: 'Content',
      private: 'Visibility',
      id: 'ID',
      baseRevision: 'Base revision',
    }
    return errors.map((error: { path?: string[], message: string }) => {
      const field = error.path?.[0]
      return `${field ? (fieldNames[field] || field) : 'Error'}: ${error.message}`
    }).join('\n')
  }
  catch {
    return message
  }
}

type FileSaveConflict =
  | { code: 'source_conflict', current: FileRecord }
  | { code: 'path_conflict', path: string }

function reviveFileRecord(input: FileRecord): FileRecord {
  return {
    ...input,
    createdAt: new Date(input.createdAt),
    updatedAt: new Date(input.updatedAt),
    deletedAt: input.deletedAt ? new Date(input.deletedAt) : null,
  }
}

export function decodeFileSaveConflict(error: { code?: string, message: string }): FileSaveConflict | null {
  if (error.code !== 'CONFLICT')
    return null
  try {
    const payload = JSON.parse(error.message) as Partial<FileSaveConflict>
    if (payload.code === 'source_conflict' && payload.current)
      return { code: payload.code, current: reviveFileRecord(payload.current) }
    if (payload.code === 'path_conflict' && payload.path)
      return { code: payload.code, path: payload.path }
    return null
  }
  catch {
    return null
  }
}

export function sourceConflictFromActionError(error: { code?: string, message: string }): FileRecord | null {
  const conflict = decodeFileSaveConflict(error)
  return conflict?.code === 'source_conflict' ? conflict.current : null
}

export function formatFileSaveError(error: { code?: string, message: string }) {
  const conflict = decodeFileSaveConflict(error)
  if (conflict?.code === 'path_conflict')
    return `Another active File already uses ${conflict.path}.`
  return formatActionError(error.message)
}

export function findPreviousActiveFile(history: string[], files: FileRecord[]) {
  const previousPath = history.at(-2)
  return files.find(file => !file.deletedAt && file.path === previousPath)
}
