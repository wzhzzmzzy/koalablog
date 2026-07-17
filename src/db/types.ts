import type { MarkdownSource } from '.'

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
