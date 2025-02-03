import type { APIRoute } from 'astro'
import { createAuth } from '@/lib/services/auth'

export const ALL: APIRoute = async (ctx) => {
  const auth = createAuth({
    type: import.meta.env.DB || 'sqlite',
    DB: ctx.locals.runtime.env.DB,
  })
  return auth.handler(ctx.request)
}
