import { fromHighlighter } from '@shikijs/markdown-it/core'
import MarkdownIt from 'markdown-it'
import { createHighlighterCore, type HighlighterGeneric } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'

export function rawMd() {
  const md = MarkdownIt()

  const defaultFence = md.renderer.rules.fence || function (tokens, idx, options, env, self) {
    return self.renderToken(tokens, idx, options)
  }

  md.renderer.rules.fence = function (tokens, idx, options, env, self) {
    const rawCodeHtml = defaultFence(tokens, idx, options, env, self)
    return `<div class="code-block">\n${rawCodeHtml}</div>\n`
  }

  return md
}

const ShikiMap = new Map()

async function getShiki() {
  const shiki = ShikiMap.get('shiki')

  if (shiki)
    return shiki

  const highlighter = await createHighlighterCore({
    themes: [
      import('@shikijs/themes/catppuccin-latte'),
      import('@shikijs/themes/catppuccin-frappe'),
    ],
    langs: [
      import('@shikijs/langs/jsx'),
      import('@shikijs/langs/typescript'),
      import('@shikijs/langs/javascript'),
      import('@shikijs/langs/rust'),
      import('@shikijs/langs/haskell'),
      import('@shikijs/langs/python'),
      import('@shikijs/langs/json'),
    ],
    engine: createJavaScriptRegexEngine(),
  })
  const instance = MarkdownIt()

  const theme = globalThis.window?.localStorage.getItem('theme') || 'light'
  instance.use(fromHighlighter(highlighter as HighlighterGeneric<any, any>, {
    theme: theme === 'light' ? 'catppuccin-latte' : 'catppuccin-frappe',
    transformers: [
      {
        postprocess(html, _options) {
          return `<div class="code-block">${html}</div>`
        },
      },
    ],
  }))

  ShikiMap.set('shiki', instance)

  return instance
}

export function md() {
  return getShiki()
}
