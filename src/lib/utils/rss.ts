import type { APIContext } from 'astro'
import rss from '@astrojs/rss'
import { readActivePaths, readAllPublic } from '@/db/markdown'
import { getDisplayTitle } from '@/lib/files/display-title'
import { decodeStoredTags } from '@/lib/files/stored-tags'
import { getSvelteBrief } from '@/lib/files/svelte-brief'
import { rawMd } from '@/lib/markdown'

export async function retriveRss(ctx: APIContext) {
  const rssConfig = ctx.locals.config.rss || { enable: true }
  if (!rssConfig.enable) {
    return new Response(null, { status: 404 })
  }

  const pageConfig = ctx.locals.config.pageConfig
  const title = pageConfig.title ?? 'Koalablog'

  const allPosts = await readAllPublic(ctx.locals.runtime?.env)
  const rssPosts = allPosts.filter(post => post.path !== '/data' && !post.path.startsWith('/data/'))
  const activePaths = await readActivePaths(ctx.locals.runtime?.env)
  const site = rssConfig.site ?? ctx.site ?? ctx.url.origin
  const md = rawMd({
    allFilePaths: activePaths,
  })

  return rss({
    title,
    description: rssConfig.description ?? '',
    site,
    items: rssPosts.map((post) => {
      const isSvelte = post.renderer === 'svelte'
      const brief = isSvelte ? getSvelteBrief(post.content) : ''
      const content = isSvelte
        ? (brief ? `<p>${md.utils.escapeHtml(brief)}</p>` : '')
        : md.render(post.content || '')
      const firstParagraph = /<p>(.*?)<\/p>/.exec(content)
      return {
        title: getDisplayTitle(post),
        link: post.path,
        categories: decodeStoredTags(post.tags),
        pubDate: post.createdAt,
        description: isSvelte ? md.utils.escapeHtml(brief) : firstParagraph?.[1] || '',
        content,
      }
    }),
    stylesheet: '/rss/pretty-feed-v3.xsl',
    customData: `<language>${rssConfig.lang || 'en-US'}</language>`,
  })
}
