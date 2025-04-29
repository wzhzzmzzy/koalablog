import type { APIContext } from 'astro'
import { jwtVerify, SignJWT } from 'jose'
import { ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY } from '../kv'

export async function tokenSign(payload: any, adminKey: string) {
  const secret = new TextEncoder().encode(adminKey)

  const jwt = await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('2h')
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

export async function authInterceptor(ctx: APIContext) {
  const config = ctx.locals.config

  const accessToken = ctx.cookies.get(ACCESS_TOKEN_KEY)
  const refreshToken = ctx.cookies.get(REFRESH_TOKEN_KEY)

  const authed = accessToken && await tokenVerify(accessToken.value, config.auth.adminKey!)
  const needRefresh = !authed && refreshToken && refreshToken?.value === config._runtime.refresh_token

  if (needRefresh) {
    ctx.cookies.set(ACCESS_TOKEN_KEY, await tokenSign({ role: 'admin' }, config.auth.adminKey || 'koala-key'), {
      httpOnly: true,
      secure: true,
      path: '/',
    })
  }

  ctx.locals.session = {
    authed: authed || needRefresh || false,
  }
}
