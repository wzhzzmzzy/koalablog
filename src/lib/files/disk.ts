import type { FileRecord } from '@/db/types'
import type { AbsoluteFilePath, RendererMode } from './types'
import { parseAbsoluteFilePath } from './path'
import { RENDERER_MODE } from './types'

export class FileDiskError extends Error {
  constructor(
    public readonly code: 'invalid_file_path' | 'unsupported_extension' | 'duplicate_disk_path',
    message: string,
  ) {
    super(message)
    this.name = 'FileDiskError'
  }
}

export interface DiskSourceFile {
  path: AbsoluteFilePath
  renderer: RendererMode
  content: string
}

export function fileDiskPath(path: string, renderer: RendererMode) {
  const parsed = parseAbsoluteFilePath(path)
  if (!parsed.ok)
    throw new FileDiskError('invalid_file_path', `Invalid File Path: ${path}`)
  const extension = renderer === RENDERER_MODE.Svelte ? '.svelte' : '.md'
  return `${parsed.value.slice(1)}${extension}`
}

export function fileFromDiskPath(input: string) {
  const diskPath = input.replaceAll('\\', '/')
  const renderer = diskPath.endsWith('.svelte')
    ? RENDERER_MODE.Svelte
    : diskPath.endsWith('.md')
      ? RENDERER_MODE.Markdown
      : null
  if (!renderer)
    throw new FileDiskError('unsupported_extension', `Only .md and .svelte files can be imported: ${input}`)

  const withoutExtension = diskPath.slice(0, renderer === RENDERER_MODE.Svelte ? -7 : -3)
  const parsed = parseAbsoluteFilePath(`/${withoutExtension.replace(/^\/+/, '')}`)
  if (!parsed.ok)
    throw new FileDiskError('invalid_file_path', `Invalid File disk Path: ${input}`)
  return { path: parsed.value, renderer }
}

export function fileExportEntries(files: FileRecord[]) {
  const entries: Record<string, string> = {}
  for (const file of files) {
    if (file.deletedAt)
      continue
    const diskPath = fileDiskPath(file.path, file.renderer)
    if (diskPath in entries)
      throw new FileDiskError('duplicate_disk_path', `Duplicate disk Path: ${diskPath}`)
    entries[diskPath] = file.content
  }
  return entries
}
