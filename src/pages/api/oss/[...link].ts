import type { APIContext, APIRoute } from 'astro'

export const GET: APIRoute = async (ctx: APIContext) => {
  const { link } = ctx.params
  const key = ctx.url.searchParams.get('key')

  if (!link || !key) {
    return new Response('invalid params', {
      status: 400,
    })
  }

  const object = await ctx.locals.runtime.env.OSS.get(`${link}/${key}`)

  if (!object) {
    return new Response(`cannot found object by ${link}/${key}`, {
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

export const POST: APIRoute = async (ctx: APIContext) => {
  const { link } = ctx.params
  const formData = await ctx.request.formData()
  const file = formData.get('file') as any
  if (!file) {
    return new Response('No file uploaded', { status: 400 })
  }
  const fileName = file.name || `upload-${Date.now()}`
  const key = `${link}/${fileName}`

  await ctx.locals.runtime.env.OSS.put(key, file, {
    httpMetadata: {
      contentType: file.type,
    },
    customMetadata: {
      uploadedAt: new Date().toISOString(),
      originalName: file.name,
      size: file.size.toString(),
    },
  })

  return new Response('created', {
    status: 201,
  })
}

export const DELETE: APIRoute = async (ctx: APIContext) => {
  const { link } = ctx.params
  const key = ctx.url.searchParams.get('key')

  if (!link || !key) {
    return new Response('invalid params', {
      status: 400,
    })
  }

  await ctx.locals.runtime.env.OSS.delete(`${link}/${key}`)

  return new Response('ok')
}
