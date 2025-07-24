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

export async function md() {
  const highlighter = await createHighlighterCore({
    themes: [
      import('@shikijs/themes/vitesse-light'),
    ],
    langs: [
      import('@shikijs/langs/jsx'),
      import('@shikijs/langs/typescript'),
      import('@shikijs/langs/javascript'),
      import('@shikijs/langs/rust'),
      import('@shikijs/langs/json'),
    ],
    engine: createJavaScriptRegexEngine(),
  })

  const instance = MarkdownIt()

  instance.use(fromHighlighter(highlighter as HighlighterGeneric<any, any>, {
    theme: 'vitesse-light',
    transformers: [
      {
        postprocess(html, _options) {
          return `<div class="code-block">${html}</div>`
        },
      },
    ],
  }))

  return instance
}
