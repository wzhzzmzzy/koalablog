import { stripMetaBlock } from '@/lib/services/markdown-parser'

const MAX_EXCERPT_LENGTH = 280

export function fileReferencePeekExcerpt(content: string) {
  const normalized = stripMetaBlock(content)
    .replace(/\s+/g, ' ')
    .trim()

  if (!normalized)
    return 'This File has no Source yet.'

  if (normalized.length <= MAX_EXCERPT_LENGTH)
    return normalized

  return `${normalized.slice(0, MAX_EXCERPT_LENGTH).trimEnd()}…`
}
