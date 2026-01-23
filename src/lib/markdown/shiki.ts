import type { CatppuccinTheme } from '../const/config'
import type { GlobalConfig } from '../kv'
import {
  createHighlighterCore,
  createJavaScriptRegexEngine,
} from 'shiki'

export interface HighlightOptions {
  theme?: CatppuccinTheme
  themeConfig?: ThemeConfig
  langSet?: string[]
}

export type ThemeConfig = GlobalConfig['pageConfig']['theme']

export async function createShikiHighlighter(
  options: HighlightOptions,
) {
  const { theme: renderTheme, themeConfig, langSet } = options

  let theme: string | null = null
  let lightTheme: string | null = null
  let darkTheme: string | null = null

  const isSSR = import.meta.env?.SSR ?? true

  if (!isSSR) {
    const pageEl = globalThis.window?.document.querySelector(
      '#page',
    ) as HTMLDivElement
    const { lightTheme: l, darkTheme: d } = pageEl?.dataset || {}
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    lightTheme = l || null
    darkTheme = d || null
    theme = (query.matches ? darkTheme : lightTheme) || 'latte'
  }
  else {
    theme = renderTheme || themeConfig?.light || 'latte'
    lightTheme = themeConfig?.light || null
    darkTheme = themeConfig?.dark || null
  }

  const has = (lang: string) =>
    langSet
      ? lang.split(',').some(l => langSet.includes(l))
      : true

  const highlighter = await createHighlighterCore({
    themes: [
      [theme, lightTheme, darkTheme].includes('latte')
      && import('@shikijs/themes/catppuccin-latte'),
      [theme, lightTheme, darkTheme].includes('frappe')
      && import('@shikijs/themes/catppuccin-frappe'),
      [theme, lightTheme, darkTheme].includes('macchiato')
      && import('@shikijs/themes/catppuccin-macchiato'),
      [theme, lightTheme, darkTheme].includes('mocha')
      && import('@shikijs/themes/catppuccin-mocha'),
    ].filter(i => !!i) as any,
    langs: [
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
    ].filter(i => !!i) as any,
    engine: createJavaScriptRegexEngine(),
  })

  return {
    highlighter,
    theme: `catppuccin-${theme}`,
  }
}
