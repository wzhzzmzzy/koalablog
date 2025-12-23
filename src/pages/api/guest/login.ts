import type { APIRoute } from 'astro'
import { updateCookieToken } from '@/lib/auth'

export const GET: APIRoute = async (ctx) => {
  const passkey = ctx.request.headers.get('X-Guest-Passkey')
  const { config } = ctx.locals

  if (!passkey) {
    return new Response(JSON.stringify({ error: 'Missing X-Guest-Passkey header' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Ensure auth config exists
  if (!config.auth) {
    return new Response(JSON.stringify({ error: 'System not initialized' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (config.auth.guestKey === passkey) {
    // Role is guest
    // Key used for signing is adminKey
    // Refresh is false for guest
    await updateCookieToken(ctx, { role: 'guest' }, { key: config.auth.adminKey, refresh: false })

    return new Response(JSON.stringify({ message: 'Login successful' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  })
}
