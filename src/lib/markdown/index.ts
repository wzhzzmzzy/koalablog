import type { Token } from 'markdown-it/index.js'
import type { RenderRule } from 'markdown-it/lib/renderer.mjs'
import type { CatppuccinTheme } from '../const/config'
import type { GlobalConfig } from '../kv'
import { katex } from '@mdit/plugin-katex'
import { fromHighlighter } from '@shikijs/markdown-it/core'
import MarkdownIt from 'markdown-it'
// eslint-disable-next-line ts/ban-ts-comment
// @ts-ignore
import MarkdownItContainer from 'markdown-it-container'
import { escapeHtml, unescapeAll } from 'markdown-it/lib/common/utils.mjs'
import { createHighlighterCore, type HighlighterGeneric } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'

type ThemeConfig = GlobalConfig['pageConfig']['theme']

// from: https://github.com/olets/markdown-it-wrapperless-fence-rule/blob/main/src/index.ts
const wrapperlessFenceRule: RenderRule = (tokens, idx, options, _env, _slf) => {
  /**
   * Begin https://github.com/markdown-it/markdown-it/blob/14.1.0/lib/renderer.mjs#L30-L46
   */
  const token = tokens[idx]
  const info = token.info ? unescapeAll(token.info).trim() : ''
  let langName = ''
  let langAttrs = ''

  if (info) {
    const arr = info.split(/(\s+)/g)
    langName = arr[0]
    langAttrs = arr.slice(2).join('')
  }

  let highlighted
  if (options.highlight) {
    highlighted
      = options.highlight(token.content, langName, langAttrs)
      || escapeHtml(token.content)
  }
  else {
    highlighted = escapeHtml(token.content)
  }
  /**
   * end https://github.com/markdown-it/markdown-it/blob/14.1.0/lib/renderer.mjs#L30-L46
   */

  /**
   * https://github.com/markdown-it/markdown-it/blob/14.1.0/lib/renderer.mjs#L49
   */
  return `${highlighted}\n`
}

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

function tex(mdInstance: MarkdownIt) {
  mdInstance.use(katex, {
    output: 'mathml',
  })
}

export function rawMd(opt: { tex?: boolean } = {}) {
  const md: MarkdownIt & { renderLangSet?: Set<string> } = MarkdownIt()

  expandable(md)
  opt.tex && tex(md)

  const defaultFence = md.renderer.rules.fence || function (tokens, idx, options, env, self) {
    return self.renderToken(tokens, idx, options)
  }

  md.renderLangSet = new Set()
  md.renderer.rules.fence = function (tokens, idx, options, env, self) {
    const lang = tokens[idx].info
    md.renderLangSet?.add(lang)
    const rawCodeHtml = defaultFence(tokens, idx, options, env, self)
    return `<div class="code-block"><span class="code-lang">${(lang || '').toUpperCase()}</span><div class="code-content">${rawCodeHtml}</div></div>\n`
  }

  return md
}

const ShikiMap = new Map<'shiki', MarkdownIt>()

async function getShiki(renderTheme?: CatppuccinTheme, themeConfig?: ThemeConfig, langSet?: string[]) {
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

  const has = (lang: string) =>
    !import.meta.env.SSR ? langSet?.length ? lang.split(',').some(l => langSet.includes(l)) : true : true

  const highlighter = await createHighlighterCore({
    themes: [
      theme === 'latte' && import('@shikijs/themes/catppuccin-latte'),
      theme === 'frappe' && import('@shikijs/themes/catppuccin-frappe'),
      theme === 'macchiato' && import('@shikijs/themes/catppuccin-macchiato'),
      theme === 'mocha' && import('@shikijs/themes/catppuccin-mocha'),
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
  const instance = MarkdownIt()

  instance.renderer.rules.fence = wrapperlessFenceRule

  expandable(instance)
  tex(instance)

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

export function md({ theme, themeConfig, langSet }: {
  theme?: CatppuccinTheme
  themeConfig?: ThemeConfig
  langSet?: string[]
} = {}) {
  return getShiki(theme, themeConfig, langSet)
}
