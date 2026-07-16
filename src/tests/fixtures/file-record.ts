import type { FileRecord } from '@/db/types'
import { MarkdownSource } from '@/db'

export function makeFileRecord(overrides: Partial<FileRecord> = {}): FileRecord {
  const now = new Date()
  return {
    id: 1,
    source: MarkdownSource.Unknown,
    path: '/fixture',
    title: 'fixture',
    content: null,
    tags: null,
    incoming_links: null,
    outgoing_links: null,
    private: false,
    remoteTruth: false,
    revision: 1,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  }
}
