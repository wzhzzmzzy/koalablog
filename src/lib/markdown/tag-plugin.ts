import type MarkdownIt from 'markdown-it'

interface TagPluginOptions {
  className?: string
}

function tagPlugin(md: MarkdownIt, options: TagPluginOptions = {}) {
  const className = options.className || 'tag'

  const tagRule = (state: any, silent: boolean) => {
    try {
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

      // 检查是否在链接内部 - 简单检测：如果后面有 ]( 就跳过
      const remaining = src.slice(pos)
      if (remaining.includes('](')) {
        const bracketPos = remaining.indexOf('](')
        // 如果 ]( 在标签可能的范围内，跳过处理
        if (bracketPos > 0 && bracketPos < 100) { // 限制检查范围避免性能问题
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

        // 处理Unicode代理对和组合字符
        if (char >= 0xD800 && char <= 0xDBFF && tagEnd + 1 < max) {
          // 高代理位，跳过下一个低代理位
          tagEnd += 2
        }
        else {
          tagEnd++
        }
      }

      // 标签内容不能为空 - 如果为空，跳过这个 # 字符继续解析
      if (tagEnd === tagStart) {
        // 必须推进 state.pos 避免死循环，但不创建 token
        state.pos = pos + 1
        return false
      }

      const tagContent = src.slice(tagStart, tagEnd)

      // 如果是 silent 模式，只返回是否匹配，但要推进状态位置
      if (silent) {
        const finalPos = hasClosingHash ? tagEnd + 1 : tagEnd
        state.pos = finalPos
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
    // eslint-disable-next-line unused-imports/no-unused-vars
    catch (_: unknown) {
      // 捕获任何异常，确保解析器不会崩溃
      // 推进位置避免死循环
      if (state.pos < state.src.length) {
        state.pos++
      }
      return false
    }
  }

  // 注册 inline rule - 在链接解析之后运行
  md.inline.ruler.after('link', 'tag', tagRule)

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
