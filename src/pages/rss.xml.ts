import type { APIContext } from 'astro'
import { MarkdownSource } from '@/db'
import { readAll } from '@/db/markdown'
import { rawMd } from '@/lib/markdown'
import rss from '@astrojs/rss'

export async function GET(ctx: APIContext) {
  const rssConfig = ctx.locals.config.rss || { enable: true }
  if (!rssConfig.enable) {
    return new Response(null, { status: 404 })
  }

  const pageConfig = ctx.locals.config.pageConfig
  const title = pageConfig.title ?? 'Koalablog'

  const allPosts = await readAll(ctx.locals.runtime?.env, MarkdownSource.Post, false)
  const site = rssConfig.site ?? ctx.site ?? ctx.url.origin
  const md = rawMd({
    allPostLinks: allPosts,
  })

  return rss({
    title,
    description: rssConfig.description ?? '',
    site,
    items: allPosts.map((post) => {
      const content = md.render(post.content || '')
      const firstParagraph = /<p>(.*?)<\/p>/.exec(content)
      return {
        title: post.subject,
        link: `/${post.link}`,
        categories: (post.tags || '')?.split(','),
        pubDate: post.createdAt,
        description: firstParagraph?.[1] || '',
        content,
      }
    }),
    stylesheet: '/rss/pretty-feed-v3.xsl',
    customData: `<language>${rssConfig.lang || 'en-US'}</language>`,
  })
}
