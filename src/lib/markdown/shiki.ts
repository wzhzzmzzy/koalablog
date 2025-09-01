import type MarkdownIt from 'markdown-it'
import type { CatppuccinTheme } from '../const/config'
import type { GlobalConfig } from '../kv'
import { fromHighlighter } from '@shikijs/markdown-it/core'
import { createHighlighterCore, createJavaScriptRegexEngine, createOnigurumaEngine, type HighlighterGeneric, loadWasm } from 'shiki'
import { wrapperlessFenceRule } from './wrapperless-fence-rule'

export interface HighlightOptions {
  theme?: CatppuccinTheme
  themeConfig?: ThemeConfig
  langSet?: string[]
}

export type ThemeConfig = GlobalConfig['pageConfig']['theme']

export async function useShiki(instance: MarkdownIt, options: HighlightOptions) {
  const { theme: renderTheme, themeConfig, langSet } = options

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

  // @ts-expect-error WASM file has no declaration
  await loadWasm(import('shiki/onig.wasm'))

  const highlighter = await createHighlighterCore({
    themes: [
      () => import('@shikijs/themes/catppuccin-latte'),
      () => import('@shikijs/themes/catppuccin-frappe'),
      () => import('@shikijs/themes/catppuccin-macchiato'),
      () => import('@shikijs/themes/catppuccin-mocha'),
    ].filter(i => !!i),
    langs: [
      () => import('@shikijs/langs/markdown'),
      () => import('@shikijs/langs/jsx'),
      () => import('@shikijs/langs/typescript'),
      () => import('@shikijs/langs/javascript'),
      () => import('@shikijs/langs/rust'),
      has('hs,haskell') && import('@shikijs/langs/haskell'),
      has('py,python') && import('@shikijs/langs/python'),
      has('json') && import('@shikijs/langs/json'),
      has('ini') && import('@shikijs/langs/ini'),
    ].filter(i => !!i),
    engine: createOnigurumaEngine(),
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
}
