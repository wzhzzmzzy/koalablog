import type { APIRoute } from 'astro'
import { authInterceptor } from '@/lib/auth'
import { ipConfig, putIpConfig } from '@/lib/kv/ip'

export const GET: APIRoute = async (context) => {
  await authInterceptor(context)
  if (!context.locals.session?.authed) {
    return new Response('Unauthorized', { status: 401 })
  }

  const ip = await ipConfig(context.locals.runtime?.env)
  return new Response(JSON.stringify({ ip }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const PUT: APIRoute = async (context) => {
  await authInterceptor(context)
  if (!context.locals.session?.authed) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    const { ip } = await context.request.json() as { ip?: unknown }
    if (typeof ip !== 'string') {
      return new Response('Invalid IP address', { status: 400 })
    }

    if (context.locals.runtime?.env) {
      await putIpConfig(context.locals.runtime.env, ip)
      return new Response(null, { status: 204 })
    }
  }
  catch {
    return new Response('Invalid request body', { status: 400 })
  }

  return new Response('Internal Server Error', { status: 500 })
}
