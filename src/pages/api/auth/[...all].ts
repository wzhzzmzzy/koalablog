import type { APIRoute } from 'astro'
import { getDataSource } from '@/db'
import { createAuth } from '@/lib/services/auth'

export const ALL: APIRoute = async (ctx) => {
  const env = ctx.locals.runtime?.env || {}
  const auth = createAuth({
    type: getDataSource(env) || 'sqlite',
    DB: env.DB,
    secret: env.AUTH_SECRET || 'koala-secret',
  })
  return auth.handler(ctx.request)
}
