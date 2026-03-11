import type { APIRoute } from 'astro'
import { MarkdownSource } from '@/db'
import { batchUpsert, batchRemoveByLinks, readAll } from '@/db/markdown'
import { authInterceptor } from '@/lib/auth'

export const GET: APIRoute = async (ctx) => {
  await authInterceptor(ctx)

  if (ctx.locals.session.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const sourceParam = ctx.url.searchParams.get('source')
  const source = sourceParam === 'post' ? MarkdownSource.Post
    : sourceParam === 'page' ? MarkdownSource.Page
    : MarkdownSource.Memo

  const env = ctx.locals.runtime?.env
  const records = await readAll(env, source, false)

  return new Response(JSON.stringify(records.map(r => ({
    id: r.id,
    link: r.link,
    subject: r.subject,
  }))), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

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

export const DELETE: APIRoute = async (ctx) => {
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
      return new Response(JSON.stringify({ error: 'Request body must be an array of links' }), {
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

    const links = body.filter((item): item is string => typeof item === 'string')

    if (links.length === 0) {
      return new Response(JSON.stringify({ error: 'No valid links provided' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const env = ctx.locals.runtime?.env
    const results = await batchRemoveByLinks(env, links)

    return new Response(JSON.stringify({
      success: true,
      count: results.length,
      results,
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