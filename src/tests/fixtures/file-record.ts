import type { FileRecord } from '@/db/types'
import { MarkdownSource } from '@/db'

export function makeFileRecord(overrides: Partial<FileRecord> = {}): FileRecord {
  const now = new Date()
  return {
    id: 1,
    source: MarkdownSource.Unknown,
    path: '/fixture',
    title: 'fixture',
    renderer: 'markdown',
    content: '',
    sourceHash: 'c4a3e04fa78d47ace9853e81fcedcf84172449d37a72852120d3a41b14a6c1f5',
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
