import type { APIContext } from 'astro'
import type { ActionAPIContext } from 'astro:actions'
import { findApiTokenByHash, findUserById } from '@/db/user'
import { hashApiToken } from './api-token'
import { readSession, SESSION_COOKIE_NAME } from './session'

export async function authInterceptor(ctx: APIContext | ActionAPIContext) {
  const env = ctx.locals.runtime?.env

  const authHeader = ctx.request.headers.get('Authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const presented = authHeader.slice(7)
    if (presented) {
      const token = await findApiTokenByHash(env ?? {} as Env, await hashApiToken(presented))
      const user = token ? await findUserById(env ?? {} as Env, token.userId) : undefined
      if (user) {
        ctx.locals.session = { userId: user.id, role: user.role }
        return
      }
    }
  }

  const sessionId = ctx.cookies.get(SESSION_COOKIE_NAME)?.value
  const record = sessionId ? await readSession(env, sessionId) : null
  ctx.locals.session = record
    ? { userId: record.userId, role: record.role }
    : { userId: null, role: '' }
}
