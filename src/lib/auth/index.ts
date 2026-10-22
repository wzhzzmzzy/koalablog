import type { APIContext } from 'astro'
import type { ActionAPIContext } from 'astro:actions'
import { findApiTokenByHash, findUserById } from '@/db/user'
import { hashApiToken } from './api-token'
import { readSession, SESSION_COOKIE_NAME } from './session'

type Identity = App.Locals['session']

interface RequestAuthentication {
  env: Env | undefined
  authorization: string | null
  bearer: Promise<Identity | null>
  sessionId?: string
  session?: ReturnType<typeof readSession>
}

const requestAuthentication = new WeakMap<Request, RequestAuthentication>()

async function readBearerIdentity(env: Env | undefined, authorization: string | null): Promise<Identity | null> {
  if (authorization?.startsWith('Bearer ')) {
    const presented = authorization.slice(7)
    if (presented) {
      const token = await findApiTokenByHash(env ?? {} as Env, await hashApiToken(presented))
      const user = token ? await findUserById(env ?? {} as Env, token.userId) : undefined
      if (user)
        return { userId: user.id, role: user.role }
    }
  }
  return null
}

export async function authInterceptor(ctx: APIContext | ActionAPIContext, { allowSession = true } = {}) {
  const env = ctx.locals.runtime?.env
  const authorization = ctx.request.headers.get('Authorization')
  let authentication = requestAuthentication.get(ctx.request)
  if (!authentication || authentication.env !== env || authentication.authorization !== authorization) {
    authentication = { env, authorization, bearer: readBearerIdentity(env, authorization) }
    requestAuthentication.set(ctx.request, authentication)
  }

  const bearer = await authentication.bearer
  if (bearer) {
    ctx.locals.session = { ...bearer }
    return
  }

  // API-only callers must not turn an invalid API Token into a valid Session.
  const sessionId = allowSession ? ctx.cookies.get(SESSION_COOKIE_NAME)?.value : undefined
  if (sessionId && authentication.sessionId !== sessionId) {
    authentication.sessionId = sessionId
    authentication.session = readSession(env, sessionId)
  }
  const record = sessionId ? await authentication.session : null
  ctx.locals.session = record
    ? { userId: record.userId, role: record.role }
    : { userId: null, role: '' }
}
