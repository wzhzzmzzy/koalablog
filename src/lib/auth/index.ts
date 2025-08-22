import type { APIContext } from 'astro'
import type { ActionAPIContext } from 'astro:actions'
import { addDays, addHours, isBefore } from 'date-fns'
import { jwtVerify, SignJWT } from 'jose'
import { ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY, updateGlobalConfig } from '../kv'
import { md5 } from './md5'

export async function tokenSign(payload: any, adminKey: string, expires: string) {
  const secret = new TextEncoder().encode(adminKey)

  const jwt = await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(expires)
    .sign(secret)

  return jwt
}

export async function refreshTokenSign(adminKey: string) {
  const refreshKey = md5(adminKey)
  const secret = new TextEncoder().encode(refreshKey)

  const jwt = await new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .sign(secret)

  return jwt
}

async function tokenVerify(token: string, adminKey: string, role: 'admin' | 'guest') {
  const secret = new TextEncoder().encode(adminKey)
  try {
    const result = await jwtVerify(token, secret)
    return (role === 'guest' ? ['guest', 'admin'] : ['admin']).includes(result.payload.role as string)
  }
  catch {
    return false
  }
}

export async function authInterceptor(ctx: APIContext | ActionAPIContext, role: 'admin' | 'guest' = 'admin') {
  const config = ctx.locals.config

  const accessToken = ctx.cookies.get(ACCESS_TOKEN_KEY)
  const refreshToken = ctx.cookies.get(REFRESH_TOKEN_KEY)

  const authed = accessToken && await tokenVerify(accessToken.value, config.auth.adminKey!, role)
  const needRefresh = !authed && refreshToken && refreshToken?.value === config._runtime.refresh_token && isBefore(new Date(), config._runtime.refresh_expired_at || 0)

  if (needRefresh) {
    await updateCookieToken(ctx, { role }, { key: config.auth.adminKey, refresh: role === 'admin' })
  }

  ctx.locals.session = {
    authed: authed || needRefresh || false,
    // verified as this role, not the real role
    asRole: role,
  }
}

interface TokenOptions {
  key?: string
  refresh?: boolean
}

/**
 * ctx: Astro APIContext
 * accessTokenPayload: JWT Custom Payload
 * options: JWT Generating Options
 */
export async function updateCookieToken(ctx: APIContext | ActionAPIContext, accessTokenPayload: any, options: TokenOptions) {
  const { key = 'koala-random-key', refresh = true } = options
  const tokenSignTime = new Date()

  const [accessToken, refreshToken] = await Promise.all([
    tokenSign(accessTokenPayload, key, refresh ? '1h' : '3d'),
    refresh && refreshTokenSign(key),
  ].filter(i => !!i))
  ctx.cookies.set(ACCESS_TOKEN_KEY, accessToken, {
    httpOnly: true,
    secure: true,
    sameSite: true,
    path: '/',
    expires: refresh ? addHours(tokenSignTime, 1) : addDays(tokenSignTime, 3),
  })

  if (refresh) {
    const refreshTokenExpires = addDays(tokenSignTime, 7)
    ctx.cookies.set(REFRESH_TOKEN_KEY, refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: true,
      path: '/',
      expires: refreshTokenExpires,
    })

    await updateGlobalConfig(ctx.locals.runtime?.env, {
      _runtime: {
        refresh_token: refreshToken,
        refresh_expired_at: refreshTokenExpires.getTime(),
      },
    })
  }
}
