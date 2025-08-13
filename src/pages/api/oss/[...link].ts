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

  const object = await ctx.locals.runtime.env.OSS.get(`${source}/${key}`)

  if (!object) {
    return new Response(`cannot found object by ${source}/${key}`, {
      status: 404,
    })
  }

  const headers = new Headers()
  // 这个方法会报错 non-POJO, 暂时手动实现
  // object.writeHttpMetadata(headers)
  Object.entries(object.httpMetadata || {}).forEach((i) => {
    headers.append(i[0], i[1] as string)
  })
  headers.append('Content-Length', String(object.size))
  headers.set('etag', object.httpEtag)

  return new Response(object.body, {
    headers,
  })
}
