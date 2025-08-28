import type MarkdownIt from 'markdown-it'
import type { CatppuccinTheme } from '../const/config'
import type { GlobalConfig } from '../kv'
import { fromHighlighter } from '@shikijs/markdown-it/core'
import { createHighlighterCore, createJavaScriptRegexEngine, type HighlighterGeneric } from 'shiki'
import { wrapperlessFenceRule } from './wrapperless-fence-rule'

const ShikiMap = new Map<'shiki', MarkdownIt>()

export interface HighlightOptions {
  theme?: CatppuccinTheme
  themeConfig?: ThemeConfig
  langSet?: string[]
}

export type ThemeConfig = GlobalConfig['pageConfig']['theme']

export async function useShiki(instance: MarkdownIt, options: HighlightOptions) {
  const { theme: renderTheme, themeConfig, langSet } = options

  const shiki = ShikiMap.get('shiki')
  if (shiki)
    return shiki

  let theme: string | null = null
  let lightTheme: string | null = null
  let darkTheme: string | null = null

  if (!import.meta.env.SSR) {
    const pageEl = globalThis.window?.document.querySelector('#page') as HTMLDivElement
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
    !import.meta.env.SSR ? langSet?.length ? lang.split(',').some(l => langSet.includes(l)) : true : true

  const highlighter = await createHighlighterCore({
    themes: [
      [theme, lightTheme, darkTheme].includes('latte') && import('@shikijs/themes/catppuccin-latte'),
      [theme, lightTheme, darkTheme].includes('frappe') && import('@shikijs/themes/catppuccin-frappe'),
      [theme, lightTheme, darkTheme].includes('macchiato') && import('@shikijs/themes/catppuccin-macchiato'),
      [theme, lightTheme, darkTheme].includes('mocha') && import('@shikijs/themes/catppuccin-mocha'),
    ].filter(i => !!i),
    langs: [
      has('jsx') && import('@shikijs/langs/jsx'),
      has('ts,typescript') && import('@shikijs/langs/typescript'),
      has('js,javascript') && import('@shikijs/langs/javascript'),
      has('rs,rust') && import('@shikijs/langs/rust'),
      has('hs,haskell') && import('@shikijs/langs/haskell'),
      has('py,python') && import('@shikijs/langs/python'),
      has('json') && import('@shikijs/langs/json'),
      has('ini') && import('@shikijs/langs/ini'),
    ].filter(i => !!i),
    engine: createJavaScriptRegexEngine(),
  })

  instance.renderer.rules.fence = wrapperlessFenceRule

  instance.use(fromHighlighter(highlighter as HighlighterGeneric<any, any>, {
    theme: `catppuccin-${theme}`,
    transformers: [
      {
        postprocess(html, { lang }) {
          return `<div class="code-block"><span class="code-lang">${(lang || '').toUpperCase()}</span><div class="code-content">${html}</div></div>`
        },
      },
    ],
  }))

  ShikiMap.set('shiki', instance)
}
