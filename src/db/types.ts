export interface Markdown {
  id: number
  source: number
  link: string
  subject: string
  content: string | null
  tags: string | null
  incoming_links: string | null
  outgoing_links: string | null
  createdAt: Date
  updatedAt: Date
  deleted: boolean
}
