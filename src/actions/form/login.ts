import { findUserByUsername } from '@/db/user'
import { verifyPassword } from '@/lib/auth/password'
import { createSession, deleteSession, SESSION_COOKIE_NAME, SESSION_TTL_SECONDS } from '@/lib/auth/session'
import { ActionError, defineAction } from 'astro:actions'
import { z } from 'astro:schema'

const prodCookieParams = import.meta.env.MODE === 'development'
  ? {}
  : { secure: true }

export const login = defineAction({
  accept: 'json',
  input: z.object({
    username: z.string().min(1),
    password: z.string().min(1),
  }),
  handler: async (input, ctx) => {
    const env = ctx.locals.runtime?.env ?? {} as Env
    const user = await findUserByUsername(env, input.username)
    const passwordValid = user
      ? await verifyPassword(input.password, { salt: user.passwordSalt, hash: user.passwordHash })
      : false
    if (!user || !passwordValid) {
      throw new ActionError({
        message: 'Invalid username or password',
        code: 'UNAUTHORIZED',
      })
    }

    const sessionId = await createSession(env, { userId: user.id, role: user.role })
    ctx.cookies.set(SESSION_COOKIE_NAME, sessionId, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      expires: new Date(Date.now() + SESSION_TTL_SECONDS * 1000),
      ...prodCookieParams,
    })
  },
})

export const logout = defineAction({
  accept: 'json',
  input: z.optional(z.object({})).default({}),
  handler: async (_, ctx) => {
    const sessionId = ctx.cookies.get(SESSION_COOKIE_NAME)?.value
    if (sessionId)
      await deleteSession(ctx.locals.runtime?.env, sessionId)
    ctx.cookies.delete(SESSION_COOKIE_NAME, { path: '/' })
  },
})
