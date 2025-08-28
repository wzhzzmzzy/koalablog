import type { RenderRule } from 'markdown-it/lib/renderer.mjs'
import { escapeHtml, unescapeAll } from 'markdown-it/lib/common/utils.mjs'

// from: https://github.com/olets/markdown-it-wrapperless-fence-rule/blob/main/src/index.ts
export const wrapperlessFenceRule: RenderRule = (tokens, idx, options, _env, _slf) => {
  /**
   * Begin https://github.com/markdown-it/markdown-it/blob/14.1.0/lib/renderer.mjs#L30-L46
   */
  const token = tokens[idx]
  const info = token.info ? unescapeAll(token.info).trim() : ''
  let langName = ''
  let langAttrs = ''

  if (info) {
    const arr = info.split(/(\s+)/g)
    langName = arr[0]
    langAttrs = arr.slice(2).join('')
  }

  let highlighted
  if (options.highlight) {
    highlighted
      = options.highlight(token.content, langName, langAttrs)
      || escapeHtml(token.content)
  }
  else {
    highlighted = escapeHtml(token.content)
  }
  /**
   * end https://github.com/markdown-it/markdown-it/blob/14.1.0/lib/renderer.mjs#L30-L46
   */

  /**
   * https://github.com/markdown-it/markdown-it/blob/14.1.0/lib/renderer.mjs#L49
   */
  return `${highlighted}\n`
}
