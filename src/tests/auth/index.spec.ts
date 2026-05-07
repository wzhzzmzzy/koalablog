import { authInterceptor, refreshTokenSign } from '@/lib/auth'
import { md5 } from '@/lib/auth/md5'
import { ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY } from '@/lib/kv'
import { SignJWT } from 'jose'
import { describe, expect, it, vi } from 'vitest'

const adminKey = 'admin-secret'

function createContext(refreshToken?: string, runtimeRefreshToken?: string, runtimeRefreshExpiredAt = Date.now() + 60_000) {
  const cookies = {
    get: vi.fn((key: string) => {
      if (key === ACCESS_TOKEN_KEY)
        return undefined

      if (key === REFRESH_TOKEN_KEY && refreshToken)
        return { value: refreshToken }

      return undefined
    }),
    set: vi.fn(),
  }

  return {
    cookies,
    request: new Request('https://koala.test/dashboard'),
    locals: {
      config: {
        pageConfig: {},
        rss: {},
        font: {},
        auth: { adminKey },
        oss: {},
        _runtime: {
          ready: true,
          refresh_token: runtimeRefreshToken,
          refresh_expired_at: runtimeRefreshExpiredAt,
        },
      },
      runtime: {},
    },
  } as any
}

async function signRefreshToken(expiresAt: number) {
  const secret = new TextEncoder().encode(md5(adminKey))

  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(Math.floor(expiresAt / 1000))
    .sign(secret)
}

describe('authInterceptor refresh token', () => {
  it('accepts a refresh token with a valid signature even when it is not the runtime refresh token', async () => {
    const refreshToken = await refreshTokenSign(adminKey)
    const ctx = createContext(refreshToken, 'another-login-refresh-token')

    await authInterceptor(ctx)

    expect(ctx.locals.session.role).toBe('admin')
    expect(ctx.cookies.set).toHaveBeenCalledWith(
      ACCESS_TOKEN_KEY,
      expect.any(String),
      expect.objectContaining({ httpOnly: true, path: '/' }),
    )
  })

  it('rejects an expired refresh token even when it matches the runtime refresh token', async () => {
    const expiredRefreshToken = await signRefreshToken(Date.now() - 60_000)
    const ctx = createContext(expiredRefreshToken, expiredRefreshToken)

    await authInterceptor(ctx)

    expect(ctx.locals.session.role).toBe('')
    expect(ctx.cookies.set).not.toHaveBeenCalled()
  })

  it('allows refresh tokens from separate logins to refresh independently', async () => {
    const firstLoginRefreshToken = await signRefreshToken(Date.now() + 7 * 24 * 60 * 60 * 1000)
    const secondLoginRefreshToken = await signRefreshToken(Date.now() + 6 * 24 * 60 * 60 * 1000)

    const firstLoginCtx = createContext(firstLoginRefreshToken, secondLoginRefreshToken)
    const secondLoginCtx = createContext(secondLoginRefreshToken, secondLoginRefreshToken)

    await authInterceptor(firstLoginCtx)
    await authInterceptor(secondLoginCtx)

    expect(firstLoginCtx.locals.session.role).toBe('admin')
    expect(secondLoginCtx.locals.session.role).toBe('admin')
    expect(firstLoginCtx.cookies.set).toHaveBeenCalledWith(
      ACCESS_TOKEN_KEY,
      expect.any(String),
      expect.objectContaining({ httpOnly: true, path: '/' }),
    )
    expect(secondLoginCtx.cookies.set).toHaveBeenCalledWith(
      ACCESS_TOKEN_KEY,
      expect.any(String),
      expect.objectContaining({ httpOnly: true, path: '/' }),
    )
  })
})
