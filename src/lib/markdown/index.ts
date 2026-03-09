import type { CatppuccinTheme } from '../const/config'
import { createProcessor } from './processor'
import { createShikiHighlighter, type ThemeConfig } from './shiki'
import { scanLanguages } from './utils'

export interface DoubleLinkPluginOptions {
  className?: string
  allPostLinks?: { subject: string, link: string }[]
  target?: '_self' | '_blank'
}

export interface ParsedMeta {
  [key: string]: string | boolean | null
}

export interface KoalaMdInstance {
  render: (src: string) => Promise<string>
  renderLangSet?: string[]
  allPostLinks?: DoubleLinkPluginOptions['allPostLinks']
  meta?: ParsedMeta
}

export async function md(
  opt: {
    meta?: boolean
    raw?: boolean
    theme?: CatppuccinTheme
    themeConfig?: ThemeConfig
    langSet?: string[]
    allPostLinks?: DoubleLinkPluginOptions['allPostLinks']
  } = {},
) {
  const highlighterAndTheme = !opt.raw ? await createShikiHighlighter(opt) : undefined

  const processor = createProcessor({
    shiki: highlighterAndTheme,
    wikiLinks: opt.allPostLinks
      ? { allPostLinks: opt.allPostLinks }
      : undefined,
  })

  return {
    async render(src: string) {
      try {
        const file = await processor.process(src)
        return String(file)
      }
      catch (e) {
        console.error('Markdown rendering failed (sync)', e)
        return String(src)
      }
      finally {
        highlighterAndTheme?.highlighter.dispose()
      }
    },
    renderLangSet: opt.langSet || [],
    allPostLinks: opt.allPostLinks,
    meta: {} as ParsedMeta,
  } as KoalaMdInstance
}

export async function render(
  opt: {
    content: string
    raw?: boolean
    themeConfig?: ThemeConfig
    allPostLinks?: DoubleLinkPluginOptions['allPostLinks']
  },
) {
  const { content, raw, themeConfig, allPostLinks } = opt
  let shikiOptions

  const langSet = scanLanguages(content)
  if (!raw) {
    const { highlighter, theme } = await createShikiHighlighter({
      themeConfig,
      langSet,
    })
    shikiOptions = { highlighter, theme }
  }

  const processor = createProcessor({
    shiki: shikiOptions,
    wikiLinks: allPostLinks ? { allPostLinks } : undefined,
  })

  const file = await processor.process(content)

  shikiOptions?.highlighter?.dispose()

  return {
    content: String(file),
    renderLangSet: langSet,
  }
}

export { type ThemeConfig } from './shiki'
