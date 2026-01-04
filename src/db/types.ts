import { MarkdownSource } from '.'

export interface Markdown {
  id: number
  source: number
  link: string
  subject: string
  content?: string | null
  tags?: string | null
  incoming_links?: string | null
  outgoing_links?: string | null
  private: boolean
  createdAt: Date
  updatedAt: Date
  deleted: boolean
}

export function initMarkdown(source = MarkdownSource.Unknown): Markdown {
  const now = new Date()
  return {
    id: 0,
    source,
    link: '',
    subject: '',
    content: null,
    tags: null,
    incoming_links: null,
    outgoing_links: null,
    private: false,
    createdAt: now,
    updatedAt: now,
    deleted: false,
  }
}
