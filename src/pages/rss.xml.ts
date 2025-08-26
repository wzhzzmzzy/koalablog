import type { APIContext } from 'astro'
import { MarkdownSource } from '@/db'
import { readAll } from '@/db/markdown'
import rss from '@astrojs/rss'

export async function GET(ctx: APIContext) {
  const rssConfig = ctx.locals.config.rss || { enable: true }
  console.log('rss', rssConfig)
  if (!rssConfig.enable) {
    return new Response(null, { status: 404 })
  }

  const pageConfig = ctx.locals.config.pageConfig
  const title = pageConfig.title ?? 'Koalablog'

  const allPosts = await readAll(ctx.locals.runtime?.env, MarkdownSource.Post, false)
  const site = rssConfig.site ?? ctx.site ?? ctx.url.origin

  return rss({
    // `<title>` field in output xml
    title,
    // `<description>` field in output xml
    description: rssConfig.description ?? '',
    // Pull in your project "site" from the endpoint context
    // https://docs.astro.build/en/reference/api-reference/#site
    site,
    // Array of `<item>`s in output xml
    // See "Generating items" section for examples using content collections and glob imports
    items: allPosts.map(post => ({
      title: post.subject,
      link: `/${post.link}`,
      categories: (post.tags || '')?.split(','),
      pubDate: post.createdAt,
      content: post.content || undefined,
    })),
    stylesheet: '/rss/pretty-feed-v3.xsl',
    // (optional) inject custom xml
    customData: `<language>${rssConfig.lang || 'en-US'}</language>`,
  })
}
