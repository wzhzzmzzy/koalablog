import type { FileRecord } from '@/db/types'
import { parseAbsoluteFilePath } from './path'

export class MarkdownDiskError extends Error {
  constructor(
    public readonly code: 'invalid_file_path' | 'unsupported_extension' | 'duplicate_disk_path',
    message: string,
  ) {
    super(message)
    this.name = 'MarkdownDiskError'
  }
}

export function markdownDiskPath(path: string) {
  const parsed = parseAbsoluteFilePath(path)
  if (!parsed.ok)
    throw new MarkdownDiskError('invalid_file_path', `Invalid File Path: ${path}`)
  return `${parsed.value.slice(1)}.md`
}

export function filePathFromMarkdownDiskPath(input: string) {
  const diskPath = input.replaceAll('\\', '/')
  if (!diskPath.endsWith('.md'))
    throw new MarkdownDiskError('unsupported_extension', `Only .md files can be imported: ${input}`)

  const withoutExtension = diskPath.slice(0, -3)
  const parsed = parseAbsoluteFilePath(`/${withoutExtension.replace(/^\/+/, '')}`)
  if (!parsed.ok)
    throw new MarkdownDiskError('invalid_file_path', `Invalid Markdown disk Path: ${input}`)
  return parsed.value
}

export function markdownExportEntries(files: FileRecord[]) {
  const entries: Record<string, string> = {}
  for (const file of files) {
    if (file.deletedAt)
      continue
    const diskPath = markdownDiskPath(file.path)
    if (diskPath in entries)
      throw new MarkdownDiskError('duplicate_disk_path', `Duplicate disk Path: ${diskPath}`)
    entries[diskPath] = file.content ?? ''
  }
  return entries
}
