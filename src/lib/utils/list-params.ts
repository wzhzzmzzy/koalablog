import { MarkdownSource } from '@/db'

export interface IndexListParams {
  source: MarkdownSource
  year?: number
  tag?: string
}

export function parseIndexListParams(searchParams: URLSearchParams): IndexListParams {
  const source = searchParams.get('s') === 'memo' ? MarkdownSource.Memo : MarkdownSource.Post
  const yearParam = searchParams.get('y') ?? ''
  const year = /^\d{4}$/.test(yearParam) ? Number(yearParam) : undefined
  const tag = searchParams.get('tag')?.trim() || undefined
  return { source, year, tag }
}
