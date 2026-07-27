import { ActionError, defineAction } from 'astro:actions'
import { z } from 'astro:schema'
import { ensureTemplateCatalogInitialized } from '@/db/template-catalog'
import { createFirstAdmin } from '@/db/user'
import { hashPassword } from '@/lib/auth/password'
import { createSession, setSessionCookie } from '@/lib/auth/session'
import { globalConfig, putGlobalConfig } from '@/lib/kv'

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
    const user = await createFirstAdmin(env, {
      username: input.username,
      passwordHash: hash,
      passwordSalt: salt,
    })
    if (!user) {
      throw new ActionError({
        code: 'CONFLICT',
        message: 'Site is already initialized',
      })
    }

    const sessionId = await createSession(env, { userId: user.id, role: user.role })
    setSessionCookie(ctx, sessionId)

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
