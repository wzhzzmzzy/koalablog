import type { APIContext, APIRoute } from 'astro'
import { incrementToday } from '@/db/ossAccess'

export const GET: APIRoute = async (ctx: APIContext) => {
  const { link } = ctx.params

  const [source, ...rest] = (link || '').split('_')
  const key = rest.join('_')

  if (!link || !source || !key) {
    return new Response('invalid params', {
      status: 400,
    })
  }

  const readLimit = ctx.locals.config.oss.readLimit || 1
  const todayAccess = await incrementToday(ctx.locals.runtime?.env, readLimit / 50, 'read')

  if ((todayAccess[0]?.readTimes || 0) > readLimit) {
    return new Response(`reached today's access limit`, {
      status: 403,
    })
  }

  const OSS = ctx.locals.OSS || ctx.locals.runtime.env.OSS
  const object = await OSS.get(`${source}/${key}`)

  if (!object) {
    return new Response(`cannot found object by ${source}/${key}`, {
      status: 404,
    })
  }

  const headers = new Headers()
  // Handle both Cloudflare R2 objects and SQLite blob objects
  if (object.httpMetadata) {
    Object.entries(object.httpMetadata).forEach(([key, value]) => {
      if (value) {
        headers.set(key, value as string)
      }
    })
  }
  headers.set('Content-Length', String(object.size))

  // For SQLite storage, we don't have etag, so generate one based on key
  if ('httpEtag' in object && typeof object.httpEtag === 'string') {
    headers.set('etag', object.httpEtag)
  }
  else {
    headers.set('etag', `"${key.replace(/\W/g, '')}"`)
  }

  // Return blob data for SQLite or object.body for R2
  const responseBody = 'body' in object ? object.body : null

  return new Response(responseBody, {
    headers,
  })
}
