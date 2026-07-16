import { MarkdownSource } from '.'

export interface FileRecord {
  id: number
  source: MarkdownSource
  path: string
  title: string
  content?: string | null
  tags?: string | null
  incoming_links?: string | null
  outgoing_links?: string | null
  private: boolean
  remoteTruth: boolean
  revision: number
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
}

export function initFileRecord(source = MarkdownSource.Unknown): FileRecord {
  const now = new Date()
  return {
    id: 0,
    source,
    path: '',
    title: '',
    content: null,
    tags: null,
    incoming_links: null,
    outgoing_links: null,
    private: false,
    remoteTruth: false,
    revision: 0,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }
}
