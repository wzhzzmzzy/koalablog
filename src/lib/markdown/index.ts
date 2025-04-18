import { fromHighlighter } from '@shikijs/markdown-it/core'
import MarkdownIt from 'markdown-it'
import { createHighlighterCore, type HighlighterGeneric } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'

export async function md() {
  const highlighter = await createHighlighterCore({
    themes: [
      import('@shikijs/themes/vitesse-light'),
    ],
    langs: [
      import('@shikijs/langs/javascript'),
      import('@shikijs/langs/typescript'),
      import('@shikijs/langs/rust'),
    ],
    engine: createJavaScriptRegexEngine(),
  })

  const instance = MarkdownIt()

  instance.use(fromHighlighter(highlighter as HighlighterGeneric<any, any>, {
    theme: 'vitesse-light',
  }))

  return instance
}
