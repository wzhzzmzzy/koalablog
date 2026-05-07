import type { APIRoute } from 'astro'
import { clearRemoteTruth, readRemoteTruth } from '@/db/markdown'
import { authInterceptor } from '@/lib/auth'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function requireBearerAdmin(ctx: Parameters<APIRoute>[0]) {
  await authInterceptor(ctx)

  const authHeader = ctx.request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ') || ctx.locals.session.role !== 'admin') {
    return jsonResponse({ error: 'Unauthorized' }, 401)
  }

  return null
}

export const GET: APIRoute = async (ctx) => {
  const unauthorized = await requireBearerAdmin(ctx)
  if (unauthorized) return unauthorized

  const env = ctx.locals.runtime?.env
  const records = await readRemoteTruth(env)

  return jsonResponse(records)
}

export const POST: APIRoute = async (ctx) => {
  const unauthorized = await requireBearerAdmin(ctx)
  if (unauthorized) return unauthorized

  try {
    const body = await ctx.request.json() as { id?: number; ids?: number[] }
    const ids = Array.isArray(body.ids)
      ? body.ids
      : typeof body.id === 'number'
        ? [body.id]
        : []

    if (ids.length === 0 || ids.some(id => typeof id !== 'number')) {
      return jsonResponse({ error: 'Request body must include id or ids' }, 400)
    }

    const env = ctx.locals.runtime?.env
    await Promise.all(ids.map(id => clearRemoteTruth(env, id)))

    return jsonResponse({ success: true })
  }
  catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return jsonResponse({ error: message }, 500)
  }
}
