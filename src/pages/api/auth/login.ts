import type { APIContext, APIRoute } from 'astro'
import { tokenSign } from '@/lib/auth'
import { ACCESS_TOKEN_KEY } from '@/lib/kv'

export const POST: APIRoute = async (ctx: APIContext) => {
  const { adminKey } = await ctx.request.json() as { adminKey: string }

  if (ctx.locals.config.auth.adminKey === adminKey) {
    const accessToken = await tokenSign({ role: 'admin' }, adminKey)

    ctx.cookies.set(ACCESS_TOKEN_KEY, accessToken, {
      httpOnly: true,
      path: '/',
      // TODO: support expire
    })

    return new Response(JSON.stringify({
      status: 'success',
    }), {
      status: 200,
    })
  }
  else {
    return new Response(JSON.stringify({
      status: 'auth failed',
    }), {
      status: 401,
    })
  }
}
