import type { APIRoute } from 'astro'
import { getDataSource } from '@/db'
import { createAuth } from '@/lib/services/auth'

export const ALL: APIRoute = async (ctx) => {
  const auth = createAuth({
    type: getDataSource(ctx.locals.runtime.env) || 'sqlite',
    DB: ctx.locals.runtime.env.DB,
    secret: ctx.locals.runtime.env.AUTH_SECRET || 'koala-secret',
  })
  return auth.handler(ctx.request)
}
