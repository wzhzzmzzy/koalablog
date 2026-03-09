import type { DoubleLinkPluginOptions, ParsedMeta } from '@/lib/markdown'
import { md } from '@/lib/markdown'

export interface ParsedMarkdownResult {
  html: string
  meta?: ParsedMeta
  outgoingLinks: Array<{ subject: string, link: string }>
  tags: string[]
  error?: string
}

export interface MarkdownParseOptions {
  includeMeta?: boolean
  allPostLinks?: DoubleLinkPluginOptions['allPostLinks']
  subject?: string
  addSubjectAsH1?: boolean
}

/**
 * Parse markdown content and extract meta, outgoing links, and tags
 */
export async function parseMarkdownContent(
  content: string,
  options: MarkdownParseOptions = {},
): Promise<ParsedMarkdownResult> {
  const {
    allPostLinks = [],
    subject = '',
    addSubjectAsH1 = false,
  } = options

  try {
    // Create markdown instance with meta parsing enabled
    const mdInstance = await md({
      allPostLinks,
    })

    // Prepare content for rendering
    let processedContent = content
    if (addSubjectAsH1 && subject) {
      processedContent = `# ${subject}\n\n${content}`
    }

    // Render markdown to HTML
    const html = await mdInstance.render(processedContent)

    // Extract meta information if available
    const meta = mdInstance.meta

    // Parse the HTML to extract links and tags
    const { outgoingLinks, tags } = extractLinksAndTags(html)

    return {
      html,
      meta,
      outgoingLinks,
      tags,
    }
  }
  catch (error) {
    console.error('Failed to parse markdown:', error)
    return {
      html: '',
      meta: undefined,
      outgoingLinks: [],
      tags: [],
      error: error instanceof Error ? error.message : 'Unknown parsing error',
    }
  }
}

/**
 * Extract outgoing links and tags from rendered HTML
 */
function extractLinksAndTags(html: string): {
  outgoingLinks: Array<{ subject: string, link: string }>
  tags: string[]
} {
  try {
    // Create a temporary DOM element to parse HTML
    const tempDiv = document.createElement('div')
    tempDiv.innerHTML = html

    // Extract outgoing links
    const outgoingLinkEls: HTMLAnchorElement[] = Array.from(
      tempDiv.querySelectorAll('a.outgoing-link'),
    )
    const outgoingLinks = outgoingLinkEls
      .map(el => ({
        subject: el.textContent || '',
        link: el.dataset.link || '',
      }))
      .filter(link => !!link.link && !!link.subject)

    // Extract tags
    const tagEls: HTMLSpanElement[] = Array.from(
      tempDiv.querySelectorAll('span.tag'),
    )

    if (typeof tempDiv.remove === 'function') {
      tempDiv.remove()
    }

    const tags = [...new Set(
      tagEls
        .map(el => el.getAttribute('data-tag'))
        .filter(Boolean) as string[],
    )]

    return {
      outgoingLinks,
      tags,
    }
  }
  catch (error) {
    console.error('Failed to extract links and tags from HTML:', error)
    return {
      outgoingLinks: [],
      tags: [],
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
  files: Array<{ subject: string, content: string }>,
  options: MarkdownParseOptions = {},
): Promise<Array<ParsedMarkdownResult & { subject: string, originalContent: string }>> {
  const results: Array<ParsedMarkdownResult & { subject: string, originalContent: string }> = []

  for (const file of files) {
    const parseResult = await parseMarkdownContent(file.content, {
      ...options,
      subject: file.subject,
    })

    results.push({
      ...parseResult,
      subject: file.subject,
      originalContent: file.content,
    })
  }

  return results
}
