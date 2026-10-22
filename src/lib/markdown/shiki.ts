import type MarkdownIt from 'markdown-it'
import type { HighlighterCore, HighlighterGeneric } from 'shiki/core'
import type { CatppuccinTheme } from '../const/config'
import type { GlobalConfig } from '../kv'
import { fromHighlighter } from '@shikijs/markdown-it/core'
import { createHighlighterCore } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'
import { wrapperlessFenceRule } from './wrapperless-fence-rule'

export interface HighlightOptions {
  theme?: CatppuccinTheme
  themeConfig?: ThemeConfig
  langSet?: string[]
}

export type ThemeConfig = GlobalConfig['pageConfig']['theme']

let highlighterPromise: Promise<HighlighterCore> | undefined

function loadHighlighter(themes: Array<string | null>, langSet?: string[]) {
  highlighterPromise ??= createHighlighterCore({
    themes: [],
    langs: [],
    engine: createJavaScriptRegexEngine(),
  })
  const pending = highlighterPromise.then(async (highlighter) => {
    const loadedThemes = highlighter.getLoadedThemes()
    const loadedLanguages = highlighter.getLoadedLanguages()
    const needsTheme = (theme: string) => themes.includes(theme) && !loadedThemes.includes(`catppuccin-${theme}`)
    const has = (aliases: string) => {
      const names = aliases.split(',')
      return !names.some(name => loadedLanguages.includes(name))
        && (import.meta.env.SSR || !langSet?.length || names.some(name => langSet.includes(name)))
    }
    await Promise.all([
      highlighter.loadTheme(...[
        needsTheme('latte')
        && import('@shikijs/themes/catppuccin-latte'),
        needsTheme('frappe')
        && import('@shikijs/themes/catppuccin-frappe'),
        needsTheme('macchiato')
        && import('@shikijs/themes/catppuccin-macchiato'),
        needsTheme('mocha')
        && import('@shikijs/themes/catppuccin-mocha'),
      ].filter(theme => !!theme)),
      highlighter.loadLanguage(...[
        has('md,markdown') && import('@shikijs/langs/markdown'),
        has('jsx') && import('@shikijs/langs/jsx'),
        has('ts,typescript') && import('@shikijs/langs/typescript'),
        has('js,javascript') && import('@shikijs/langs/javascript'),
        has('rs,rust') && import('@shikijs/langs/rust'),
        has('hs,haskell') && import('@shikijs/langs/haskell'),
        has('py,python') && import('@shikijs/langs/python'),
        has('json') && import('@shikijs/langs/json'),
        has('ini') && import('@shikijs/langs/ini'),
        has('kotlin') && import('@shikijs/langs/kotlin'),
        has('yaml') && import('@shikijs/langs/yaml'),
        has('shell') && import('@shikijs/langs/shell'),
        has('toml') && import('@shikijs/langs/toml'),
      ].filter(language => !!language)),
    ])
    return highlighter
  })
  highlighterPromise = pending
  return pending.catch((error) => {
    if (highlighterPromise === pending)
      highlighterPromise = undefined
    throw error
  })
}

export async function useShiki(
  instance: MarkdownIt,
  options: HighlightOptions,
) {
  const { theme: renderTheme, themeConfig, langSet } = options

  let theme: string | null = null
  let lightTheme: string | null = null
  let darkTheme: string | null = null

  if (!import.meta.env.SSR) {
    const pageEl = globalThis.window?.document.querySelector(
      '#page',
    ) as HTMLDivElement
    const { lightTheme: light, darkTheme: dark } = pageEl?.dataset || {}
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    lightTheme = light || null
    darkTheme = dark || null
    theme = (query.matches ? darkTheme : lightTheme) || 'latte'
  }
  else {
    theme = renderTheme || themeConfig?.light || 'latte'
    lightTheme = themeConfig?.light || null
    darkTheme = themeConfig?.dark || null
  }

  const highlighter = await loadHighlighter([theme, lightTheme, darkTheme], langSet)

  instance.renderer.rules.fence = wrapperlessFenceRule

  instance.use(
    fromHighlighter(highlighter as HighlighterGeneric<any, any>, {
      theme: `catppuccin-${theme}`,
      transformers: [
        {
          postprocess(html, { lang }) {
            return `<div class="code-block"><span class="code-lang">${(lang || '').toUpperCase()}</span><div class="code-content">${html}</div></div>`
          },
        },
      ],
    }),
  )
}
