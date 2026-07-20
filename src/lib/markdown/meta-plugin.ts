import type MarkdownIt from 'markdown-it'
import type { RuleCore } from 'markdown-it/lib/parser_core.mjs'

export interface MetaPluginOptions {
  // 可以添加配置选项，比如自定义分隔符等
  delimiter?: string
}

export interface ParsedMeta {
  [key: string]: string | boolean | null
}

export interface ParsedFrontmatter {
  meta: ParsedMeta
  content: string
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

  // 处理数组 (简单的 JSON 风格数组)
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      // 尝试作为 JSON 解析
      // 注意：标准的 YAML 列表不一定是 JSON，但我们导出时使用了 JSON 兼容格式
      // 如果包含单引号，先替换为双引号（简易处理，非严谨）
      const jsonStr = trimmed.replace(/'/g, '"')
      return JSON.parse(jsonStr)
    }
    catch {
      // 解析失败则返回原字符串
      return trimmed
    }
  }

  // 默认返回原始字符串（去除空格）
  return trimmed
}

export function parseMetaContent(content: string): ParsedMeta {
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

export function parseFrontmatter(content: string, delimiter = '---'): ParsedFrontmatter | undefined {
  if (!content.startsWith(delimiter))
    return undefined

  const delimiterEnd = content.indexOf(`\n${delimiter}`, delimiter.length)
  if (delimiterEnd === -1)
    return undefined

  const metaContent = content.slice(delimiter.length, delimiterEnd).trim()
  const contentStart = delimiterEnd + delimiter.length + 1
  const remainingContent = content.slice(contentStart).replace(/^\n+/, '')

  return {
    meta: parseMetaContent(metaContent),
    content: remainingContent,
  }
}

function metaPlugin(md: MarkdownIt, options: MetaPluginOptions = {}) {
  const opts = {
    delimiter: '---',
    ...options,
  }

  // Core rule that processes the source before parsing
  const metaRule: RuleCore = (state) => {
    (md as any).meta = undefined
    const src = state.src
    const delimiter = opts.delimiter

    const frontmatter = parseFrontmatter(src, delimiter)
    if (!frontmatter) {
      return false
    }

    // Store meta in the markdown instance
    ;(md as any).meta = frontmatter.meta

    // Update the state source
    state.src = frontmatter.content

    return true
  }

  // Register the core rule to run before other parsing
  md.core.ruler.before('normalize', 'meta', metaRule)
}

export function useMetaPlugin(md: MarkdownIt, options: MetaPluginOptions = {}) {
  md.use(metaPlugin, options)
}
