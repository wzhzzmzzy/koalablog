import type { APIRoute } from 'astro'
import { authInterceptor } from '@/lib/auth'
import { getConfig, putConfig } from '@/lib/kv/custom'

export const GET: APIRoute = async (context) => {
  await authInterceptor(context)
  if (!context.locals.session?.role) {
    return new Response('Unauthorized', { status: 401 })
  }

  const key = context.url.searchParams.get('key')

  if (!key) {
    return new Response('Missing key parameter', { status: 400 })
  }

  const value = await getConfig(context.locals.runtime?.env, key)

  try {
    // try parse json
    if (value) {
      const parsed = JSON.parse(value)
      // check if it is wrapped
      if (parsed && typeof parsed === 'object' && 'updatedAt' in parsed && 'value' in parsed) {
        return new Response(JSON.stringify(parsed), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      return new Response(JSON.stringify({ value: parsed, updatedAt: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // return null if not found
    return new Response(JSON.stringify(null), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  catch {
    // return string if not json
    return new Response(JSON.stringify({ value, updatedAt: null }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

export const PUT: APIRoute = async (context) => {
  await authInterceptor(context)
  if (!context.locals.session?.role) {
    return new Response('Unauthorized', { status: 401 })
  }

  const key = context.url.searchParams.get('key')

  if (!key) {
    return new Response('Missing key parameter', { status: 400 })
  }

  try {
    const body = await context.request.json()
    // store as string
    const value = JSON.stringify({
      value: body,
      updatedAt: Date.now(),
    })

    if (context.locals.runtime?.env) {
      await putConfig(context.locals.runtime.env, key, value)
      return new Response(null, { status: 204 })
    }
    // #if !CF_PAGES
    else {
      // Fallback for local dev if runtime.env is missing but logic handles it in putConfig typically
      // But putConfig handles undefined env gracefully for local storage in our implementation?
      // Actually my implementation of putConfig checks for env?.CF_PAGES.
      // If not CF_PAGES, it uses local storage.
      // So passing undefined env is fine if we are local.
      await putConfig(undefined, key, value)
      return new Response(null, { status: 204 })
    }
    // #endif
  }
  catch (e) {
    console.error(e)
    return new Response('Invalid request body', { status: 400 })
  }

  return new Response('Internal Server Error', { status: 500 })
}
