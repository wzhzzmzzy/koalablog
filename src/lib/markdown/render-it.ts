import type { Markdown } from '@/db/types'
import type { CatppuccinTheme } from '../const/config'
import type { DoubleLinkPluginOptions } from './double-link-plugin'
import { md, rawMd } from '.'

export async function renderIt(
  raw: boolean,
  article?: Markdown,
  themeConfig?: { light: CatppuccinTheme, dark: CatppuccinTheme },
  allPostLinks?: DoubleLinkPluginOptions['allPostLinks'],
) {
  if (!raw) {
    const renderer = (await md({ themeConfig, allPostLinks }))
    return {
      content: article ? renderer.render(article.content ?? '') : '',
    }
  }

  const renderer = rawMd({ tex: true, allPostLinks })
  return {
    content: article ? renderer.render(article.content ?? '') : '',
    renderLangSet: renderer.renderLangSet,
  }
}
