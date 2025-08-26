import type { Markdown } from '@/db/types'
import type { CatppuccinTheme } from '../const/config'
import { md, rawMd } from '.'

export async function renderIt(raw: boolean, article?: Markdown, themeConfig?: { light: CatppuccinTheme, dark: CatppuccinTheme }) {
  if (!raw) {
    return {
      content: article ? (await md({ themeConfig })).render(article.content ?? '') : '',
    }
  }

  const renderer = rawMd({ tex: true })
  return {
    content: article ? renderer.render(article.content ?? '') : '',
    renderLangSet: renderer.renderLangSet,
  }
}
