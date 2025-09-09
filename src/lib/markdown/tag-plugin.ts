import type MarkdownIt from 'markdown-it'

interface TagPluginOptions {
  className?: string
}

function tagPlugin(md: MarkdownIt, options: TagPluginOptions = {}) {
  const className = options.className || 'tag'

  const tagRule = (state: any, silent: boolean) => {
    const src = state.src
    const pos = state.pos
    const max = state.src.length

    // 检查是否以 # 开头
    if (src.charCodeAt(pos) !== 0x23 /* # */) {
      return false
    }

    // 确保 # 前面不是字母数字字符（避免匹配到单词中间的#）
    if (pos > 0) {
      const prevChar = src.charCodeAt(pos - 1)
      if ((prevChar >= 0x30 && prevChar <= 0x39) // 0-9
        || (prevChar >= 0x41 && prevChar <= 0x5A) // A-Z
        || (prevChar >= 0x61 && prevChar <= 0x7A)) { // a-z
        return false
      }
    }

    const tagStart = pos + 1
    let tagEnd = tagStart
    let hasClosingHash = false

    // 跳过开头的空格（如果有的话，这种情况下不匹配）
    if (tagStart < max && src.charCodeAt(tagStart) === 0x20 /* space */) {
      return false
    }

    // 查找标签内容的结束位置
    while (tagEnd < max) {
      const char = src.charCodeAt(tagEnd)

      // 如果遇到 #，检查是否是结束标记
      if (char === 0x23 /* # */) {
        hasClosingHash = true
        break
      }

      // 如果遇到空格、换行或其他分隔符，结束标签（对于 #TagName 格式）
      if (char === 0x20 /* space */
        || char === 0x0A /* \n */
        || char === 0x0D /* \r */
        || char === 0x09 /* \t */) {
        break
      }

      tagEnd++
    }

    // 标签内容不能为空
    if (tagEnd === tagStart) {
      return false
    }

    const tagContent = src.slice(tagStart, tagEnd)

    // 如果是 silent 模式，只返回是否匹配
    if (silent) {
      return true
    }

    // 计算最终位置
    const finalPos = hasClosingHash ? tagEnd + 1 : tagEnd

    // 创建 token
    const token = state.push('tag_inline', 'span', 0)
    token.content = tagContent
    token.markup = hasClosingHash ? `#${tagContent}#` : `#${tagContent}`
    token.attrSet('class', className)

    state.pos = finalPos
    return true
  }

  // 注册 inline rule
  md.inline.ruler.before('emphasis', 'tag', tagRule)

  md.renderer.rules.tag_inline = (tokens, idx) => {
    const token = tokens[idx]
    const tagName = token.content
    const className = token.attrGet('class') || 'tag'

    return `<span class="${className}" role="button" tabindex="0" data-tag="${md.utils.escapeHtml(tagName)}" title="Click to search tag: ${md.utils.escapeHtml(tagName)}">${md.utils.escapeHtml(tagName)}</span>`
  }
}

export function useTagPlugin(md: MarkdownIt, options: TagPluginOptions = {}) {
  md.use(tagPlugin, options)
}
