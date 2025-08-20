import type { Token } from 'markdown-it/index.js'
import type { CatppuccinTheme } from '../const/config'
import type { GlobalConfig } from '../kv'
import { fromHighlighter } from '@shikijs/markdown-it/core'
import MarkdownIt from 'markdown-it'
// eslint-disable-next-line ts/ban-ts-comment
// @ts-ignore
import MarkdownItContainer from 'markdown-it-container'
import { createHighlighterCore, type HighlighterGeneric } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'

type ThemeConfig = GlobalConfig['pageConfig']['theme']

// ::: expandable summary
// some details
// :::
function expandable(mdInstance: MarkdownIt) {
  mdInstance.use(MarkdownItContainer, 'expandable', {
    validate(params: string) {
      return params.trim().match(/^expandable\s(.*)$/)
    },
    render(tokens: Token[], idx: number) {
      const m = tokens[idx].info.trim().match(/^expandable\s(.*)$/)
      if (tokens[idx].nesting === 1) {
        // opening tag
        return `<details><summary>${mdInstance.utils.escapeHtml(m?.[1] || '')}</summary>\n`
      }
      else {
        // closing tag
        return '</details>\n'
      }
    },
  })
}

export function rawMd() {
  const md = MarkdownIt()

  expandable(md)

  const defaultFence = md.renderer.rules.fence || function (tokens, idx, options, env, self) {
    return self.renderToken(tokens, idx, options)
  }

  md.renderer.rules.fence = function (tokens, idx, options, env, self) {
    const rawCodeHtml = defaultFence(tokens, idx, options, env, self)
    return `<div class="code-block">\n${rawCodeHtml}</div>\n`
  }

  return md
}

const ShikiMap = new Map<'shiki', MarkdownIt>()

async function getShiki(renderTheme?: CatppuccinTheme, themeConfig?: ThemeConfig) {
  const shiki = ShikiMap.get('shiki')

  if (shiki)
    return shiki

  let theme: string | null = null

  if (!import.meta.env.SSR) {
    theme = renderTheme || globalThis.window?.localStorage.getItem('theme')
    const pageEl = globalThis.window?.document.querySelector('#page') as HTMLDivElement
    const { lightTheme, darkTheme } = pageEl?.dataset || {}
    if (!theme || ![lightTheme, darkTheme].includes(theme as CatppuccinTheme)) {
      theme = lightTheme || 'latte'
    }
  }
  else {
    theme = renderTheme || themeConfig?.light || 'latte'
  }

  const highlighter = await createHighlighterCore({
    themes: [
      import('@shikijs/themes/catppuccin-latte'),
      import('@shikijs/themes/catppuccin-frappe'),
      import('@shikijs/themes/catppuccin-macchiato'),
      import('@shikijs/themes/catppuccin-mocha'),
    ],
    langs: [
      import('@shikijs/langs/jsx'),
      import('@shikijs/langs/typescript'),
      import('@shikijs/langs/javascript'),
      import('@shikijs/langs/rust'),
      import('@shikijs/langs/haskell'),
      import('@shikijs/langs/python'),
      import('@shikijs/langs/json'),
    ],
    engine: createJavaScriptRegexEngine(),
  })
  const instance = MarkdownIt()

  expandable(instance)

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

  return instance
}

export function md(theme?: CatppuccinTheme, themeConfig?: ThemeConfig) {
  return getShiki(theme, themeConfig)
}
