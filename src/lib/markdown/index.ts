import type { Token } from 'markdown-it/index.js'
import type { CatppuccinTheme } from '../const/config'
import { katex } from '@mdit/plugin-katex'
import MarkdownIt from 'markdown-it'
// eslint-disable-next-line ts/ban-ts-comment
// @ts-ignore
import MarkdownItContainer from 'markdown-it-container'
import { type DoubleLinkPluginOptions, useDoubleLink } from './double-link-plugin'
import { type ParsedMeta, useMetaPlugin } from './meta-plugin'
import { type ThemeConfig, useShiki } from './shiki'
import { useTagPlugin } from './tag-plugin'
import { useTodoPlugin } from './todo-plugin'

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

type KoalaMdInstance = MarkdownIt & {
  renderLangSet?: Set<string>
  allFilePaths?: DoubleLinkPluginOptions['allFilePaths']
  meta?: ParsedMeta
}

export async function md(opt: {
  theme?: CatppuccinTheme
  themeConfig?: ThemeConfig
  langSet?: string[]
  allFilePaths?: DoubleLinkPluginOptions['allFilePaths']
} = {}) {
  const md: KoalaMdInstance = MarkdownIt({ html: true })
  useMetaPlugin(md)
  expandable(md)
  tex(md)
  await useShiki(md, opt)
  useDoubleLink(md, { allFilePaths: opt.allFilePaths ?? [] })
  useTagPlugin(md)
  useTodoPlugin(md)

  return md
}

export function rawMd(opt: {
  tex?: boolean
  meta?: boolean
  allFilePaths?: DoubleLinkPluginOptions['allFilePaths']
} = {}) {
  const md: KoalaMdInstance = MarkdownIt({ html: true })
  if (opt.meta ?? true)
    useMetaPlugin(md)
  expandable(md)
  opt.tex && tex(md)

  useDoubleLink(md, { allFilePaths: opt.allFilePaths ?? [] })
  useTagPlugin(md)
  useTodoPlugin(md)

  const defaultFence = md.renderer.rules.fence || function (tokens, idx, options, _env, self) {
    return self.renderToken(tokens, idx, options)
  }

  md.renderLangSet = new Set()
  md.core.ruler.before('normalize', 'reset-render-languages', () => {
    md.renderLangSet?.clear()
  })
  md.renderer.rules.fence = function (tokens, idx, options, env, self) {
    const lang = tokens[idx].info
    md.renderLangSet?.add(lang)
    const rawCodeHtml = defaultFence(tokens, idx, options, env, self)
    return `<div class="code-block"><span class="code-lang">${(lang || '').toUpperCase()}</span><div class="code-content">${rawCodeHtml}</div></div>\n`
  }
  return md
}
