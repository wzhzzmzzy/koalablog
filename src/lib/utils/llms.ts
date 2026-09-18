import type { APIContext } from 'astro'
import { MarkdownSource } from '@/db'
import { readAllPublic } from '@/db/markdown'
import { getDisplayTitle } from '@/lib/files/display-title'
import { parseLeadingFrontmatter } from '@/lib/markdown/frontmatter'

function inlineText(value: string): string {
  return value.replace(/\s+/g, ' ').trim().replace(/[\\`*_[\]<>]/g, '\\$&')
}

export async function retrieveLlms(ctx: APIContext, format: 'index' | 'full'): Promise<Response> {
  const { pageConfig, rss } = ctx.locals.config
  const site = rss?.site ?? ctx.site ?? ctx.url.origin
  const files = await readAllPublic(ctx.locals.runtime?.env)
  files.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))

  const sections = [`# ${inlineText(pageConfig.title || 'Koalablog')}`]
  if (rss?.description?.trim())
    sections.push(`> ${inlineText(rss.description)}`)

  for (const [source, label] of [[MarkdownSource.Post, 'Posts'], [MarkdownSource.Memo, 'Memos']] as const) {
    const group = files.filter(file => file.source === source)
    if (group.length === 0)
      continue

    sections.push(`## ${label}`)
    const entries = group.map((file) => {
      const title = inlineText(file.renderer === 'svelte' ? file.title : getDisplayTitle(file))
      const path = file.path.split('/').map(segment => encodeURIComponent(segment)
        .replace(/[!'()*]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)).join('/')
      const url = new URL(path, site).href
      if (format === 'index')
        return `- [${title}](${url})`

      const body = file.renderer === 'svelte'
        ? '*This Svelte page has no Markdown body. Visit the source URL to view it.*'
        : parseLeadingFrontmatter(file.content).body
      return `### ${title}\n\nSource: ${url}\n\n${body}`
    })
    sections.push(entries.join(format === 'index' ? '\n' : '\n\n---\n\n'))
  }

  return new Response(`${sections.join('\n\n')}\n`, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}
