import type { APIContext } from 'astro'
import type { ActionAPIContext } from 'astro:actions'
import { addDays, addHours, isBefore } from 'date-fns'
import { jwtVerify, SignJWT } from 'jose'
import { ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY, updateGlobalConfig } from '../kv'
import { md5 } from './md5'

export async function tokenSign(payload: any, adminKey: string) {
  const secret = new TextEncoder().encode(adminKey)

  const jwt = await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('30m')
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

async function tokenVerify(token: string, adminKey: string) {
  const secret = new TextEncoder().encode(adminKey)
  try {
    await jwtVerify(token, secret)
    return true
  }
  catch {
    return false
  }
}

export async function authInterceptor(ctx: APIContext | ActionAPIContext) {
  const config = ctx.locals.config

  const accessToken = ctx.cookies.get(ACCESS_TOKEN_KEY)
  const refreshToken = ctx.cookies.get(REFRESH_TOKEN_KEY)

  const authed = accessToken && await tokenVerify(accessToken.value, config.auth.adminKey!)
  const needRefresh = !authed && refreshToken && refreshToken?.value === config._runtime.refresh_token && isBefore(new Date(), config._runtime.refresh_expired_at || 0)

  if (needRefresh) {
    await updateCookieToken(ctx, { role: 'admin' }, config.auth.adminKey)
  }

  ctx.locals.session = {
    authed: authed || needRefresh || false,
  }
}

export async function updateCookieToken(ctx: APIContext | ActionAPIContext, accessTokenPayload: any, adminKey: string = 'koala-random-key') {
  const tokenSignTime = new Date()

  const [accessToken, refreshToken] = await Promise.all([
    tokenSign(accessTokenPayload, adminKey),
    refreshTokenSign(adminKey),
  ])
  ctx.cookies.set(ACCESS_TOKEN_KEY, accessToken, {
    httpOnly: true,
    secure: true,
    sameSite: true,
    path: '/',
    expires: addHours(tokenSignTime, 2),
  })

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
