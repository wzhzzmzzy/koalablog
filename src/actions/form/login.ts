import { tokenSign } from '@/lib/auth'
import { ACCESS_TOKEN_KEY } from '@/lib/kv'
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
      const accessToken = await tokenSign({ role: 'admin' }, adminKey)

      ctx.cookies.set(ACCESS_TOKEN_KEY, accessToken, {
        httpOnly: true,
        path: '/',
        // TODO: support expire
      })

      return
    }

    throw new ActionError({
      message: 'auth failed',
      code: 'UNAUTHORIZED',
    })
  },
})
