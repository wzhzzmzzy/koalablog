import type { APIContext, APIRoute } from 'astro'

export const GET: APIRoute = async (ctx: APIContext) => {
  const list = await ctx.locals.runtime.env.OSS.list()

  return new Response(JSON.stringify({
    status: 'success',
    payload: list.objects.map(i => ({
      key: i.key,
      size: i.size,
      checksums: i.checksums,
    })),
  }))
}
