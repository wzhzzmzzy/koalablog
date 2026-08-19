import type MarkdownIt from 'markdown-it'
import type { RuleCore } from 'markdown-it/lib/parser_core.mjs'
import { parseLeadingFrontmatter } from '@/lib/markdown/frontmatter'

export interface MetaPluginOptions {
  delimiter?: string
}

export interface ParsedMeta {
  [key: string]: unknown
}

export interface ParsedFrontmatter {
  meta: ParsedMeta
  content: string
}

export function parseFrontmatter(content: string, delimiter = '---'): ParsedFrontmatter | undefined {
  if (delimiter !== '---')
    return undefined

  const frontmatter = parseLeadingFrontmatter(content)
  if (frontmatter.status === 'absent')
    return undefined

  return {
    meta: frontmatter.meta ?? {},
    content: frontmatter.body,
  }
}

function metaPlugin(md: MarkdownIt, options: MetaPluginOptions = {}) {
  const delimiter = options.delimiter ?? '---'

  const metaRule: RuleCore = (state) => {
    (md as any).meta = undefined
    if (delimiter !== '---') {
      return false
    }

    const frontmatter = parseLeadingFrontmatter(state.src)
    if (frontmatter.status === 'absent') {
      return false
    }

    ;(md as any).meta = frontmatter.meta
    state.src = frontmatter.body
    return true
  }

  md.core.ruler.before('normalize', 'meta', metaRule)
}

export function useMetaPlugin(md: MarkdownIt, options: MetaPluginOptions = {}) {
  md.use(metaPlugin, options)
}
