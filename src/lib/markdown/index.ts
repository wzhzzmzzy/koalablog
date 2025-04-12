import { fromAsyncCodeToHtml } from '@shikijs/markdown-it/async'
import MarkdownItAsync from 'markdown-it-async'
import { codeToHtml } from 'shiki'

export function md() {
  const inst = MarkdownItAsync()
  inst.use(fromAsyncCodeToHtml(codeToHtml as any, {
    themes: {
      light: 'vitesse-light',
      dark: 'vitesse-dark',
    },
  }))

  return inst
}
