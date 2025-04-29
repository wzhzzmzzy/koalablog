import type { APIContext, APIRoute } from 'astro'
import { putGlobalConfig } from '@/lib/kv'

export const POST: APIRoute = async (ctx: APIContext) => {
  const { blogTitle, adminKey } = await ctx.request.json() as { blogTitle: string, adminKey: string }

  const env = ctx.locals.runtime?.env || {}
  await putGlobalConfig(env, {
    pageConfig: {
      title: blogTitle,
    },
    auth: {
      adminKey,
    },
    _runtime: {
      ready: true,
    },
  })

  return new Response(JSON.stringify({
    status: 'success',
  }), {
    status: 200,
  })
}
