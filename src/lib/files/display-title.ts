import { MarkdownSource } from '@/db'
import { parseFrontmatter } from '@/lib/markdown/meta-plugin'

interface DisplayTitleFile {
  source: MarkdownSource
  title: string
  content?: string | null
}

export function getDisplayTitle(file: DisplayTitleFile): string {
  if (file.source !== MarkdownSource.Post)
    return file.title

  const title = parseFrontmatter(file.content ?? '')?.meta.title
  return typeof title === 'string' && title.trim() ? title.trim() : file.title
}
