import type { APIContext } from 'astro'
import { getRSSData } from '@/db/rss'
import rss from '@astrojs/rss'

export async function retriveRss(ctx: APIContext) {
  const rssConfig = ctx.locals.config.rss || { enable: true }
  if (!rssConfig.enable) {
    return new Response(null, { status: 404 })
  }

  const pageConfig = ctx.locals.config.pageConfig
  const title = pageConfig.title ?? 'Koalablog'

  const allPosts = await getRSSData(ctx.locals.runtime?.env)
  const site = rssConfig.site ?? ctx.site ?? ctx.url.origin
  return rss({
    title,
    description: rssConfig.description ?? '',
    site,
    items: await Promise.all(allPosts.map(async (post) => {
      const content = post.htmlContent || ''
      const firstParagraph = /<p>(.*?)<\/p>/.exec(content)
      return {
        title: post.subject,
        link: `/${post.link}`,
        categories: (post.tags || '')?.split(','),
        pubDate: post.createdAt,
        description: firstParagraph?.[1] || '',
        content,
      }
    })),
    stylesheet: '/rss/pretty-feed-v3.xsl',
    customData: `<language>${rssConfig.lang || 'en-US'}</language>`,
  })
}
