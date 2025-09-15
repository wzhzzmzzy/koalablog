import type MarkdownIt from 'markdown-it'
import type { RuleCore } from 'markdown-it/lib/parser_core.mjs'

export interface MetaPluginOptions {
  // 可以添加配置选项，比如自定义分隔符等
  delimiter?: string
}

export interface ParsedMeta {
  [key: string]: string | boolean | null
}

function parseMetaValue(value: string): string | boolean | null {
  // 去除前后空格
  const trimmed = value.trim()

  // 处理布尔值
  if (trimmed === 'true')
    return true
  if (trimmed === 'false')
    return false

  // 处理 null 值
  if (trimmed === 'null')
    return null

  // 处理引号包围的字符串
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1)
  }

  // 处理单引号包围的字符串
  if (trimmed.startsWith('\'') && trimmed.endsWith('\'')) {
    return trimmed.slice(1, -1)
  }

  // 默认返回原始字符串（去除空格）
  return trimmed
}

function parseMetaContent(content: string): ParsedMeta {
  const meta: ParsedMeta = {}
  const lines = content.split('\n')

  for (const line of lines) {
    const trimmedLine = line.trim()
    if (!trimmedLine)
      continue

    const colonIndex = trimmedLine.indexOf(':')
    if (colonIndex === -1)
      continue

    const key = trimmedLine.slice(0, colonIndex).trim()
    const value = trimmedLine.slice(colonIndex + 1).trim()

    if (key) {
      meta[key] = parseMetaValue(value)
    }
  }

  return meta
}

function metaPlugin(md: MarkdownIt, options: MetaPluginOptions = {}) {
  const opts = {
    delimiter: '---',
    ...options,
  }

  // Core rule that processes the source before parsing
  const metaRule: RuleCore = (state) => {
    (md as any).meta = null
    const src = state.src
    const delimiter = opts.delimiter

    // Check if content starts with delimiter
    if (!src.startsWith(delimiter)) {
      return false
    }

    // Find the end delimiter
    const delimiterEnd = src.indexOf(`\n${delimiter}`, delimiter.length)
    if (delimiterEnd === -1) {
      return false
    }

    // Extract meta content (between delimiters)
    const metaContent = src.slice(delimiter.length, delimiterEnd).trim()

    // Parse meta content
    const parsedMeta = parseMetaContent(metaContent);

    // Store meta in the markdown instance
    (md as any).meta = parsedMeta

    // Remove meta section from source, keeping only the markdown content
    const contentStart = delimiterEnd + delimiter.length + 1
    let remainingContent = src.slice(contentStart)

    // Remove leading newlines from remaining content
    remainingContent = remainingContent.replace(/^\n+/, '')

    // Update the state source
    state.src = remainingContent

    return true
  }

  // Register the core rule to run before other parsing
  md.core.ruler.before('normalize', 'meta', metaRule)
}

export function useMetaPlugin(md: MarkdownIt, options: MetaPluginOptions = {}) {
  md.use(metaPlugin, options)
}
