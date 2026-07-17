import type { FileRecord } from '@/db/types'
import { getMarkdownSourceKey, MarkdownSourceMap } from '@/db'

type FileCollections = Partial<Record<keyof typeof MarkdownSourceMap, FileRecord[]>>

export function flattenFileCollections(collections: FileCollections): FileRecord[] {
  return Object.values(MarkdownSourceMap)
    .flatMap(source => collections[getMarkdownSourceKey(source)] ?? [])
}
