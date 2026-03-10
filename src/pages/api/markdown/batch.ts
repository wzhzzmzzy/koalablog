import type { APIRoute } from 'astro'
import { MarkdownSource } from '@/db'
import { batchAdd, readAnyByLink } from '@/db/markdown'
import { authInterceptor } from '@/lib/auth'

export const POST: APIRoute = async (ctx) => {
  await authInterceptor(ctx)

  if (ctx.locals.session.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const body = await ctx.request.json()

    if (!Array.isArray(body)) {
      return new Response(JSON.stringify({ error: 'Request body must be an array' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (body.length === 0) {
      return new Response(JSON.stringify({ error: 'Request body cannot be empty' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const env = ctx.locals.runtime?.env
    const newPosts: Array<{
      source: MarkdownSource
      subject: string
      content: string
      link?: string
      private?: boolean
      tags?: string
      outgoing_links?: string
    }> = []
    const skipped: Array<{ link?: string; subject: string }> = []

    for (const item of body) {
      const link = item.link
      if (link) {
        const existing = await readAnyByLink(env, link)
        if (existing && existing.content === item.content) {
          skipped.push({ link, subject: item.subject })
          continue
        }
      }
      newPosts.push({
        source: item.source ?? MarkdownSource.Memo,
        subject: item.subject,
        content: item.content,
        link,
        private: item.private ?? false,
        tags: item.tags,
        outgoing_links: item.outgoingLinks ? JSON.stringify(item.outgoingLinks) : undefined,
      })
    }

    const results = newPosts.length > 0 ? await batchAdd(env, newPosts) : []

    return new Response(JSON.stringify({
      success: true,
      count: results.length,
      skipped: skipped.length,
      results: results.map(r => ({ id: r.id, link: r.link, subject: r.subject })),
      skippedItems: skipped,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}