import type { APIContext, APIRoute } from 'astro'

export const GET: APIRoute = async (ctx: APIContext) => {
  const { link } = ctx.params

  if (!link) {
    return new Response(null, {
      status: 400,
    })
  }

  const object = await ctx.locals.runtime.env.OSS.get(link!)
  if (!object) {
    return new Response(`cannot found object by ${link}`, {
      status: 404,
    })
  }

  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('etag', object.httpEtag)

  return new Response(object.body, {
    headers,
  })
}

export const POST: APIRoute = async (ctx: APIContext) => {
  const { link } = ctx.params

  if (!link) {
    return new Response(null, {
      status: 400,
    })
  }

  const object = await ctx.locals.runtime.env.OSS.put(link!)
  if (!object) {
    return new Response(`cannot found object by ${link}`, {
      status: 404,
    })
  }

  return new Response(null, {
    status: 200,
  })
}
