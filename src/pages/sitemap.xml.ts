import type { APIContext } from 'astro'
import { MarkdownSource } from '@/db'
import { readAll } from '@/db/markdown'

export async function GET(ctx: APIContext) {
  const site = ctx.site?.origin || ctx.url.origin

  // 获取所有公开的文章和页面
  const allPosts = await readAll(ctx.locals.runtime?.env, MarkdownSource.Post, false)
  const allPages = await readAll(ctx.locals.runtime?.env, MarkdownSource.Page, false)

  // 过滤掉私有页面
  const publicPages = allPages.filter(page => !page.private)

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <!-- Homepage -->
  <url>
    <loc>${site}/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  
  <!-- Posts listing page -->
  <url>
    <loc>${site}/posts</loc>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>
  
  <!-- Individual posts -->
  ${allPosts.map(post => `
  <url>
    <loc>${site}/${post.link}</loc>
    <lastmod>${post.updatedAt ? new Date(post.updatedAt).toISOString() : new Date(post.createdAt).toISOString()}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`).join('')}
  
  <!-- Individual pages -->
  ${publicPages.map(page => `
  <url>
    <loc>${site}/${page.link}</loc>
    <lastmod>${page.updatedAt ? new Date(page.updatedAt).toISOString() : new Date(page.createdAt).toISOString()}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>`).join('')}
</urlset>`

  return new Response(sitemap, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=3600', // 缓存1小时
    },
  })
}

