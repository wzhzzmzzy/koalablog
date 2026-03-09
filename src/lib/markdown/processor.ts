import rehypeShikiFromHighlighter from '@shikijs/rehype/core'
import yaml from 'js-yaml'
import rehypeKatex from 'rehype-katex'
import rehypeStringify from 'rehype-stringify'
import remarkDirective from 'remark-directive'
import remarkFrontmatter from 'remark-frontmatter'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import remarkWikiLink from 'remark-wiki-link'
import { unified } from 'unified'
import { visit } from 'unist-util-visit'
import { rehypeCodeWrapper } from './plugins/code-wrapper'
import { remarkExpandable } from './plugins/expandable'
import { remarkTag } from './plugins/tag'
import { rehypeTodo } from './plugins/todo'
import { remarkWikiLinkProperties } from './plugins/wiki-link'

function extractFrontmatter() {
  return (tree: any, file: any) => {
    visit(tree, 'yaml', (node: any) => {
      try {
        const data = yaml.load(node.value)
        file.data.frontmatter = data
      }
      catch (e) {
        console.warn('Failed to parse frontmatter', e)
      }
    })
  }
}

export interface ProcessorOptions {
  shiki?: {
    highlighter: any
    theme: string
  }
  wikiLinks?: {
    allPostLinks: { subject: string, link: string }[]
  }
}

export function createProcessor(options: ProcessorOptions = {}) {
  const processor = unified()
    .use(remarkParse)
    .use(remarkFrontmatter)
    .use(extractFrontmatter)
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkDirective)
    .use(remarkExpandable)
    .use(remarkTag)

  if (options.wikiLinks) {
    const { allPostLinks } = options.wikiLinks
    const permalinks = allPostLinks.map(p => p.subject)

    processor.use(remarkWikiLink, {
      permalinks,
      pageResolver: (name: string) => [name],
      hrefTemplate: (permalink: string) => {
        const post = allPostLinks.find(p => p.subject === permalink)
        return post
          ? post.link.startsWith('http')
            ? post.link
            : `/${post.link}`
          : ''
      },
    })
    processor.use(remarkWikiLinkProperties)
  }

  processor
    .use(remarkRehype)
    .use(rehypeKatex)
    .use(rehypeTodo)
    .use(rehypeCodeWrapper)

  if (options.shiki) {
    processor.use(rehypeShikiFromHighlighter, options.shiki.highlighter, {
      inline: 'tailing-curly-colon',
      themes: {
        light: options.shiki.theme,
        dark: options.shiki.theme,
      },
      defaultColor: false,
    })
  }

  processor.use(rehypeStringify)

  return processor
}
