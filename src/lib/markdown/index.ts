import { fromHighlighter } from '@shikijs/markdown-it/core'
import MarkdownIt from 'markdown-it'
import { createHighlighterCore, type HighlighterGeneric } from 'shiki/core'
import { createOnigurumaEngine } from 'shiki/engine/oniguruma'

export async function md() {
  const highlighter = await createHighlighterCore({
    themes: [
      import('@shikijs/themes/vitesse-light'),
    ],
    langs: [
      import('@shikijs/langs/javascript'),
    ],
    engine: createOnigurumaEngine(() => import('shiki/wasm')),
  })

  const instance = MarkdownIt()

  instance.use(fromHighlighter(highlighter as HighlighterGeneric<any, any>, {
    theme: 'vitesse-light',
  }))

  return instance
}
