import type { APIContext, APIRoute } from 'astro'
import { incrementToday } from '@/db/ossAccess'
import { authInterceptor } from '@/lib/auth'
import { publicObjectKey } from '@/lib/oss/public-key'
import { objectResponse } from '@/lib/oss/response'

/**
 * HEAD - Check if an object exists in OSS
 * Returns 200 if exists, 404 if not found
 * Requires admin authentication
 */
export const HEAD: APIRoute = async (ctx: APIContext) => {
  await authInterceptor(ctx)
  if (ctx.locals.session?.role !== 'admin') {
    return new Response(null, { status: 401 })
  }

  const key = publicObjectKey(ctx.params.link)
  if (!key)
    return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } })

  const OSS = ctx.locals.OSS || ctx.locals.runtime.env.OSS
  const object = await OSS.head(key)

  if (!object) {
    return new Response(null, { status: 404 })
  }

  return new Response(null, { status: 200 })
}

export const GET: APIRoute = async (ctx: APIContext) => {
  const key = publicObjectKey(ctx.params.link)
  if (!key)
    return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } })

  const readLimit = ctx.locals.config.oss.readLimit ?? 1
  const todayAccess = await incrementToday(ctx.locals.runtime?.env, readLimit, 'read')

  if (!todayAccess.length) {
    return new Response(`reached today's access limit`, {
      status: 403,
      headers: { 'Cache-Control': 'no-store' },
    })
  }

  const OSS = ctx.locals.OSS || ctx.locals.runtime.env.OSS
  const object = await OSS.get(key)

  if (!object) {
    return new Response('object not found', {
      status: 404,
      headers: { 'Cache-Control': 'no-store' },
    })
  }

  return objectResponse(object)
}
