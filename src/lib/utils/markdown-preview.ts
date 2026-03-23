import { stripMetaBlock } from '@/lib/services/markdown-parser'

const FENCE_PATTERN = /^(```|~~~)/
const HR_PATTERN = /^\s*([-*_])(?:\s*\1){2,}\s*$/
const REFERENCE_LINK_PATTERN = /^\s*\[[^\]]+\]:\s+\S+/

function unwrapMarkdown(line: string, pattern: RegExp) {
  let current = line
  let previous = ''

  while (current !== previous) {
    previous = current
    current = current.replace(pattern, '$2')
  }

  return current
}

function stripMarkdownLine(line: string, inFence: boolean) {
  let text = line
    .replace(/<!--.*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\\([\\`*_[\]{}()#+\-.!>~|])/g, '$1')

  if (!inFence) {
    let previous = ''
    while (text !== previous) {
      previous = text
      text = text
        .replace(/^\s{0,3}#{1,6}\s+/, '')
        .replace(/^\s*>+\s?/, '')
        .replace(/^\s*(?:[-+*]|\d+\.)\s+/, '')
        .replace(/^\s*\[(?: |x|X)\]\s+/, '')
    }

    text = text
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/\[\[([^\]]+)\]\]/g, '$1')
      .replace(/`([^`]*)`/g, '$1')
      .replace(/(^|\s)#([\w-]+)/g, '$1$2')

    text = unwrapMarkdown(text, /(\*\*|__)(.*?)\1/g)
    text = unwrapMarkdown(text, /(\*|_)(.*?)\1/g)
    text = unwrapMarkdown(text, /(~~)(.*?)\1/g)
  }

  return text
    .replace(/\|/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function getMarkdownPreviewLines(content: string | null | undefined, maxLines = 3): string[] {
  if (!content || maxLines <= 0) {
    return []
  }

  const lines = stripMetaBlock(content)
    .replace(/\r\n?/g, '\n')
    .split('\n')

  const previewLines: string[] = []
  let inFence = false

  for (const rawLine of lines) {
    const trimmedLine = rawLine.trim()

    if (FENCE_PATTERN.test(trimmedLine)) {
      inFence = !inFence
      continue
    }

    if (!inFence && (HR_PATTERN.test(trimmedLine) || REFERENCE_LINK_PATTERN.test(trimmedLine))) {
      continue
    }

    const text = stripMarkdownLine(rawLine, inFence)
    if (!text) {
      continue
    }

    previewLines.push(text)
    if (previewLines.length >= maxLines) {
      break
    }
  }

  return previewLines
}

export function getMarkdownPreviewText(content: string | null | undefined, maxLines = 3) {
  return getMarkdownPreviewLines(content, maxLines).join('\n')
}
