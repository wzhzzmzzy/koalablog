import type { APIRoute } from 'astro'
import { MarkdownSource } from '@/db'
import { batchUpsert } from '@/db/markdown'
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
    const posts = body.map((item: {
      source?: MarkdownSource
      subject: string
      content: string
      link?: string
      private?: boolean
      tags?: string
      outgoingLinks?: Array<{ subject: string; link: string }>
    }) => ({
      source: item.source ?? MarkdownSource.Memo,
      subject: item.subject,
      content: item.content,
      link: item.link,
      private: item.private ?? false,
      tags: item.tags,
      outgoing_links: item.outgoingLinks ? JSON.stringify(item.outgoingLinks) : undefined,
    }))

    const results = await batchUpsert(env, posts)

    return new Response(JSON.stringify({
      success: true,
      count: results.length,
      results: results.map((r: { id: number; link: string; subject: string }) => ({ id: r.id, link: r.link, subject: r.subject })),
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