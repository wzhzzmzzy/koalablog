import { updateGlobalConfig } from '@/lib/kv'
import { defineAction } from 'astro:actions'
import { authGuard } from '../utils/auth'

export const generateBearerToken = defineAction({
  handler: async (_, ctx) => {
    await authGuard(ctx)

    const env = ctx.locals.runtime?.env || {}
    const token = crypto.randomUUID().replace(/-/g, '')

    await updateGlobalConfig(env, {
      auth: {
        bearerToken: token,
      },
    })

    return { token }
  },
})

export const revokeBearerToken = defineAction({
  handler: async (_, ctx) => {
    await authGuard(ctx)

    const env = ctx.locals.runtime?.env || {}

    await updateGlobalConfig(env, {
      auth: {
        bearerToken: '',
      },
    })

    return { success: true }
  },
})
