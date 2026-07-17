import type MarkdownIt from 'markdown-it'
import type { RuleInline } from 'markdown-it/lib/parser_inline.mjs'
import { parseAbsoluteFilePath } from '@/lib/files/path'

export interface DoubleLinkPluginOptions {
  className?: string
  allFilePaths?: string[]
  target?: '_self' | '_blank'
}

function doubleLinkPlugin(md: MarkdownIt, options: DoubleLinkPluginOptions = {}) {
  // 默认配置
  const defaults: DoubleLinkPluginOptions = {
    className: 'outgoing-link',
    allFilePaths: [],
    target: '_blank',
  }

  const opts = Object.assign({}, defaults, options)

  // 解析规则函数
  const doubleLink: RuleInline = (state, silent) => {
    const start = state.pos
    const max = state.src.length
    const marker = '[['
    const markerEnd = ']]'

    // 检查是否以 [[ 开始
    if (start + marker.length >= max)
      return false
    if (state.src.slice(start, start + marker.length) !== marker)
      return false

    // 查找结束标记 ]]
    const endPos = state.src.indexOf(markerEnd, start + marker.length)
    if (endPos === -1)
      return false

    const reference = state.src.slice(start + marker.length, endPos).trim()
    if (!reference)
      return false

    // 如果是 silent 模式，只返回是否匹配
    if (silent)
      return true

    // 创建 token
    const token = state.push('double_link', 'a', 0)
    token.content = reference
    token.markup = marker

    // 更新解析位置
    state.pos = endPos + markerEnd.length

    return true
  }

  // 渲染规则
  md.renderer.rules.double_link = function (tokens, idx, _options, _env, _renderer) {
    const token = tokens[idx]
    const reference = token.content
    const parsed = parseAbsoluteFilePath(reference)
    const allFilePaths: string[] = (md as any).allFilePaths || opts.allFilePaths
    const path = parsed.ok ? parsed.value : ''
    const href = path && allFilePaths.includes(path) ? path : ''

    const attrs = [
      ['href', href],
      ['class', opts.className],
      ['target', opts.target],
      ['data-path', href],
    ]

    // 构建属性字符串
    const attrsStr = attrs
      .map(([name, value]) => value ? `${name}="${md.utils.escapeHtml(value)}"` : '')
      .join(' ')

    return `<a ${attrsStr}>${md.utils.escapeHtml(reference)}</a>`
  }

  // 注册内联规则
  md.inline.ruler.before('link', 'double_link', doubleLink)
}

export function useDoubleLink(md: MarkdownIt, options: DoubleLinkPluginOptions = {}) {
  md.use(doubleLinkPlugin, options)
}
