import { ensureTemplateCatalogInitialized } from '@/db/template-catalog'
import { createUser } from '@/db/user'
import { hashPassword } from '@/lib/auth/password'
import { createSession, SESSION_COOKIE_NAME, SESSION_TTL_SECONDS } from '@/lib/auth/session'
import { globalConfig, putGlobalConfig } from '@/lib/kv'
import { ActionError, defineAction } from 'astro:actions'
import { z } from 'astro:schema'

const prodCookieParams = import.meta.env.MODE === 'development'
  ? {}
  : { secure: true }

export const onboarding = defineAction({
  accept: 'json',
  input: z.object({
    blogTitle: z.string().min(1, 'Blog title cannot be empty').max(100, 'Blog title cannot exceed 100 characters'),
    username: z.string().min(1, 'Username cannot be empty').max(64, 'Username cannot exceed 64 characters'),
    password: z.string().min(6, 'Password must be at least 6 characters').max(256, 'Password cannot exceed 256 characters'),
  }),
  handler: async (input, ctx) => {
    const env = ctx.locals.runtime?.env || {}
    const config = await globalConfig(env)
    if (config._runtime?.ready) {
      throw new ActionError({
        code: 'CONFLICT',
        message: 'Site is already initialized',
      })
    }

    await ensureTemplateCatalogInitialized(env)

    const { salt, hash } = await hashPassword(input.password)
    const user = await createUser(env, {
      username: input.username,
      passwordHash: hash,
      passwordSalt: salt,
      role: 'admin',
    })

    const sessionId = await createSession(env, { userId: user.id, role: user.role })
    ctx.cookies.set(SESSION_COOKIE_NAME, sessionId, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      expires: new Date(Date.now() + SESSION_TTL_SECONDS * 1000),
      ...prodCookieParams,
    })

    await putGlobalConfig(env, {
      oss: {
        readLimit: 500000,
        operateLimit: 50000,
      },
      pageConfig: {
        title: input.blogTitle,
      },
      _runtime: {
        ready: true,
      },
    })
  },
})
