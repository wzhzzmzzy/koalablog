import { CatppuccinTheme } from '@/lib/const/config'
import { updateGlobalConfig } from '@/lib/kv'
import { defineAction } from 'astro:actions'
import { z } from 'astro:schema'
import { authGuard } from '../utils/auth'

export const settings = defineAction({
  accept: 'form',
  input: z.object({
    title: z.string().min(1, 'Title is required'),
    showPostsAtHome: z.boolean().optional(),
    lightTheme: z.nativeEnum(CatppuccinTheme, {
      errorMap: () => ({ message: 'Invalid light theme' }),
    }),
    darkTheme: z.nativeEnum(CatppuccinTheme, {
      errorMap: () => ({ message: 'Invalid dark theme' }),
    }),
    readLimit: z.preprocess(v => Number(v), z.number().min(0)),
    operateLimit: z.preprocess(v => Number(v), z.number().min(0)),
    guestPasskey: z.string().optional(),
    rssEnable: z.boolean().optional(),
    rssDesc: z.string().optional(),
    rssLang: z.string().default('en-US'),
    fontSans: z.string().optional(),
    fontSerif: z.string().optional(),
    fontMono: z.string().optional(),
    fontCDN: z.string().optional(),
  }),
  handler: async (input, ctx) => {
    await authGuard(ctx)

    const env = ctx.locals.runtime?.env || {}
    return Promise.all([
      updateGlobalConfig(env, {
        auth: {
          guestKey: input.guestPasskey,
        },
        oss: {
          readLimit: input.readLimit,
          operateLimit: input.operateLimit,
        },
        pageConfig: {
          title: input.title,
          showPostsAtHome: input.showPostsAtHome,
          theme: {
            light: input.lightTheme,
            dark: input.darkTheme,
          },
        },
        rss: {
          enable: input.rssEnable,
          description: input.rssDesc,
          lang: input.rssLang,
        },
        font: {
          sans: input.fontSans,
          serif: input.fontSerif,
          mono: input.fontMono,
          cdn: input.fontCDN,
        },
      }),
    ])
  },
})
