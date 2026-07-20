import type { DoubleLinkPluginOptions } from '@/lib/markdown/double-link-plugin'
import type { ParsedMeta } from '@/lib/markdown/meta-plugin'
import { analyzeMarkdownSource } from '@/lib/files/analysis'
import { rawMd } from '@/lib/markdown'

export interface ParsedMarkdownResult {
  html: string
  meta?: ParsedMeta
  outgoingPaths: string[]
  tags: string[]
  error?: string
}

export interface MarkdownParseOptions {
  includeMeta?: boolean
  allFilePaths?: DoubleLinkPluginOptions['allFilePaths']
  title?: string
  addTitleAsH1?: boolean
}

/**
 * Parse markdown content and extract meta, outgoing links, and tags
 */
export async function parseMarkdownContent(
  content: string,
  options: MarkdownParseOptions = {},
): Promise<ParsedMarkdownResult> {
  const {
    includeMeta = true,
    allFilePaths = [],
    title = '',
    addTitleAsH1 = false,
  } = options

  try {
    // Keep callers that exclude meta on the renderer behavior they requested.
    const mdInstance = rawMd({
      meta: includeMeta,
      allFilePaths,
    })

    // Prepare content for rendering
    let processedContent = content
    if (addTitleAsH1 && title) {
      processedContent = `# ${title}\n\n${content}`
    }

    // Render markdown to HTML
    const html = mdInstance.render(processedContent)

    // Extract meta information if available
    const meta = includeMeta ? (mdInstance as any).meta : undefined

    const { outgoingPaths, tags } = analyzeMarkdownSource(processedContent)

    return {
      html,
      meta,
      outgoingPaths,
      tags,
    }
  }
  catch (error) {
    console.error('Failed to parse markdown:', error)
    return {
      html: '',
      meta: undefined,
      outgoingPaths: [],
      tags: [],
      error: error instanceof Error ? error.message : 'Unknown parsing error',
    }
  }
}

/**
 * Strip meta information block from markdown content
 * Removes YAML frontmatter (--- delimited blocks) at the beginning
 */
export function stripMetaBlock(content: string): string {
  const lines = content.split('\n')

  // Check if content starts with YAML frontmatter (---)
  if (lines.length > 0 && lines[0].trim() === '---') {
    // Find the closing ---
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === '---') {
        // Found closing ---, return content after it (skip empty line if present)
        const remainingLines = lines.slice(i + 1)
        // Skip leading empty lines after frontmatter
        while (remainingLines.length > 0 && remainingLines[0].trim() === '') {
          remainingLines.shift()
        }
        return remainingLines.join('\n')
      }
    }
  }

  // If no YAML frontmatter found, return original content
  return content
}

/**
 * Batch parse multiple markdown files
 */
export async function batchParseMarkdown(
  files: Array<{ path: string, content: string }>,
  options: MarkdownParseOptions = {},
): Promise<Array<ParsedMarkdownResult & { path: string, originalContent: string }>> {
  const results: Array<ParsedMarkdownResult & { path: string, originalContent: string }> = []

  for (const file of files) {
    const parseResult = await parseMarkdownContent(file.content, {
      ...options,
      title: file.path.split('/').filter(Boolean).at(-1) ?? '',
    })

    results.push({
      ...parseResult,
      path: file.path,
      originalContent: file.content,
    })
  }

  return results
}
