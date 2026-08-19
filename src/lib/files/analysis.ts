import type { Token } from 'markdown-it/index.js'
import type { AbsoluteFilePath } from './types'
import MarkdownIt from 'markdown-it'
import { useDoubleLink } from '@/lib/markdown/double-link-plugin'
import { parseLeadingFrontmatter } from '@/lib/markdown/frontmatter'
import { useTagPlugin } from '@/lib/markdown/tag-plugin'
import { parseAbsoluteFilePath } from './path'

export interface MarkdownSourceAnalysis {
  tags: string[]
  outgoingPaths: AbsoluteFilePath[]
}

export interface MarkdownSourceWarning {
  code: 'invalid-frontmatter' | 'ambiguous-tags' | 'unsupported-tags'
  message: string
}

export interface PreparedMarkdownSource {
  content: string
  tags: string[]
  outgoingPaths: AbsoluteFilePath[]
  warnings: MarkdownSourceWarning[]
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

const warningMessages: Record<MarkdownSourceWarning['code'], string> = {
  'invalid-frontmatter': 'Leading frontmatter is invalid, so its tags were not changed.',
  'ambiguous-tags': 'Leading frontmatter contains more than one tags field, so its tags were not changed.',
  'unsupported-tags': 'The frontmatter tags field is not a string or string array, so it was not changed.',
}

export function prepareMarkdownSource(source: string): PreparedMarkdownSource {
  const frontmatter = parseLeadingFrontmatter(source)
  const bodyAnalysis = analyzeMarkdownSource(frontmatter.body)
  const effectiveTags: string[] = []
  const seen = new Set<string>()

  for (const tag of frontmatter.tags ?? []) {
    if (!seen.has(tag)) {
      seen.add(tag)
      effectiveTags.push(tag)
    }
  }

  for (const tag of bodyAnalysis.tags) {
    if (!seen.has(tag)) {
      seen.add(tag)
      effectiveTags.push(tag)
    }
  }

  return {
    content: frontmatter.replaceTags(effectiveTags),
    tags: effectiveTags,
    outgoingPaths: bodyAnalysis.outgoingPaths,
    warnings: frontmatter.warning
      ? [{ code: frontmatter.warning, message: warningMessages[frontmatter.warning] }]
      : [],
  }
}
