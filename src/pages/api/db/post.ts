import type { APIContext, APIRoute } from 'astro'
import { MarkdownSource } from '@/db'
import { read, readAll } from '@/db/markdown'

export const GET: APIRoute = async (ctx: APIContext) => {
  const url = new URL(ctx.request.url)

  const id = url.searchParams.get('id')
  if (id) {
    const post = await read(ctx.locals.runtime?.env, MarkdownSource.Post, id)

    return new Response(JSON.stringify({
      status: 'success',
      payload: post,
    }))
  }

  const fetchAll = url.searchParams.get('all')

  const allPosts = await readAll(ctx.locals.runtime?.env, MarkdownSource.Post, fetchAll === 'false')

  return new Response(JSON.stringify({
    status: 'success',
    payload: allPosts,
  }))
}
