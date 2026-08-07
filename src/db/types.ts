import type { MarkdownSource } from '.'
import type { RendererMode } from '@/lib/files/types'

export interface FileRecord {
  id: number
  source: MarkdownSource
  path: string
  title: string
  renderer: RendererMode
  content: string
  sourceHash: string
  tags?: string | null
  incoming_links?: string | null
  outgoing_links?: string | null
  private: boolean
  revision: number
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
  userId?: number | null
}
