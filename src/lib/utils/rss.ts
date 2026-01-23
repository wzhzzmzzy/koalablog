import type { APIContext } from 'astro'
import { readAllPublic } from '@/db/markdown'
import { md } from '@/lib/markdown'
import rss from '@astrojs/rss'

export async function retriveRss(ctx: APIContext) {
  const rssConfig = ctx.locals.config.rss || { enable: true }
  if (!rssConfig.enable) {
    return new Response(null, { status: 404 })
  }

  const pageConfig = ctx.locals.config.pageConfig
  const title = pageConfig.title ?? 'Koalablog'

  const allPosts = await readAllPublic(ctx.locals.runtime?.env)
  const site = rssConfig.site ?? ctx.site ?? ctx.url.origin
  const mdInstance = await md({
    allPostLinks: allPosts,
  })

  return rss({
    title,
    description: rssConfig.description ?? '',
    site,
    items: await Promise.all(allPosts.map(async (post) => {
      const content = await mdInstance.render(post.content || '')
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
