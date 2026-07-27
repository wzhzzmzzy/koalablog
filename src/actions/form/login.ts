import { verifyUserCredentials } from '@/db/user'
import { clearSessionCookie, createSession, deleteSession, SESSION_COOKIE_NAME, setSessionCookie } from '@/lib/auth/session'
import { ActionError, defineAction } from 'astro:actions'
import { z } from 'astro:schema'

export const login = defineAction({
  accept: 'json',
  input: z.object({
    username: z.string().min(1),
    password: z.string().min(1),
  }),
  handler: async (input, ctx) => {
    const env = ctx.locals.runtime?.env ?? {} as Env
    const user = await verifyUserCredentials(env, input.username, input.password)
    if (!user) {
      throw new ActionError({
        message: 'Invalid username or password',
        code: 'UNAUTHORIZED',
      })
    }

    const sessionId = await createSession(env, { userId: user.id, role: user.role })
    setSessionCookie(ctx, sessionId)
  },
})

export const logout = defineAction({
  accept: 'json',
  input: z.optional(z.object({})).default({}),
  handler: async (_, ctx) => {
    const sessionId = ctx.cookies.get(SESSION_COOKIE_NAME)?.value
    if (sessionId)
      await deleteSession(ctx.locals.runtime?.env, sessionId)
    clearSessionCookie(ctx)
  },
})
