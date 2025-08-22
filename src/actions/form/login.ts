import { updateCookieToken } from '@/lib/auth'
import { ActionError, defineAction } from 'astro:actions'
import { z } from 'astro:schema'

export const login = defineAction({
  accept: 'json',
  input: z.object({
    adminKey: z.string().min(1),
  }),
  handler: async (input, ctx) => {
    const { adminKey } = input

    if (ctx.locals.config.auth.adminKey === adminKey) {
      await updateCookieToken(ctx, { role: 'admin' }, adminKey)
      return
    }

    throw new ActionError({
      message: 'auth failed',
      code: 'UNAUTHORIZED',
    })
  },
})
