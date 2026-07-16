import type { Token } from 'markdown-it/index.js'
import type { AbsoluteFilePath } from './types'
import { useDoubleLink } from '@/lib/markdown/double-link-plugin'
import { useTagPlugin } from '@/lib/markdown/tag-plugin'
import MarkdownIt from 'markdown-it'
import { parseAbsoluteFilePath } from './path'

export interface MarkdownSourceAnalysis {
  tags: string[]
  outgoingPaths: AbsoluteFilePath[]
}

const analyzer = new MarkdownIt({ html: false })
useDoubleLink(analyzer)
useTagPlugin(analyzer)

function inlineChildren(tokens: Token[]): Token[] {
  return tokens.flatMap(token => token.children ?? [])
}

export function analyzeMarkdownSource(source: string): MarkdownSourceAnalysis {
  const tags: string[] = []
  const outgoingPaths: AbsoluteFilePath[] = []
  const seenTags = new Set<string>()
  const seenPaths = new Set<AbsoluteFilePath>()

  for (const token of inlineChildren(analyzer.parse(source, {}))) {
    if (token.type === 'tag_inline' && !seenTags.has(token.content)) {
      seenTags.add(token.content)
      tags.push(token.content)
    }

    if (token.type === 'double_link') {
      const path = parseAbsoluteFilePath(token.content)
      if (path.ok && !seenPaths.has(path.value)) {
        seenPaths.add(path.value)
        outgoingPaths.push(path.value)
      }
    }
  }

  return { tags, outgoingPaths }
}
