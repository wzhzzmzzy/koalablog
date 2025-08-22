import { updateCookieToken } from '@/lib/auth'
import { ActionError, defineAction } from 'astro:actions'
import { z } from 'astro:schema'

export const login = defineAction({
  accept: 'json',
  input: z.object({
    key: z.string().min(1),
    role: z.enum(['admin', 'guest']).default('admin'),
  }),
  handler: async (input, ctx) => {
    const { key, role } = input

    if (role === 'admin' && ctx.locals.config.auth.adminKey === key) {
      await updateCookieToken(ctx, { role }, { key, refresh: true })
      return
    }
    if (role === 'guest' && ctx.locals.config.auth.guestKey === key) {
      await updateCookieToken(ctx, { role }, { key: ctx.locals.config.auth.adminKey, refresh: false })
      return
    }

    throw new ActionError({
      message: `${role} auth failed`,
      code: 'UNAUTHORIZED',
    })
  },
})
