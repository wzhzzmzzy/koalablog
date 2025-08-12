import { CatppuccinTheme } from '@/lib/const/config'
import { updateGlobalConfig } from '@/lib/kv'
import { defineAction } from 'astro:actions'
import { z } from 'astro:schema'
import { authGuard } from '../utils/auth'

export const settings = defineAction({
  accept: 'form',
  input: z.object({
    title: z.string().min(1, 'Title is required'),
    lightTheme: z.nativeEnum(CatppuccinTheme, {
      errorMap: () => ({ message: 'Invalid light theme' }),
    }),
    darkTheme: z.nativeEnum(CatppuccinTheme, {
      errorMap: () => ({ message: 'Invalid dark theme' }),
    }),
  }),
  handler: async (input, ctx) => {
    await authGuard(ctx)

    const env = ctx.locals.runtime?.env || {}
    await updateGlobalConfig(env, 'pageConfig', {
      title: input.title,
      theme: {
        light: input.lightTheme,
        dark: input.darkTheme,
      },
    })
  },
})
