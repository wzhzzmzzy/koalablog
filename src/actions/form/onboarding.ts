import { putGlobalConfig } from '@/lib/kv'
import { defineAction } from 'astro:actions'
import { z } from 'astro:schema'

export const onboarding = defineAction({
  accept: 'json',
  input: z.object({
    blogTitle: z.string().min(1, 'Blog title cannot be empty').max(100, 'Blog title cannot exceed 100 characters'),
    adminKey: z.string().min(6, 'Admin key must be at least 6 characters').max(256, 'Admin key cannot exceed 256 characters'),
  }),
  handler: async (input, ctx) => {
    const { blogTitle, adminKey } = input
    const env = ctx.locals.runtime?.env || {}
    await putGlobalConfig(env, {
      oss: {
        readLimit: 500000,
        operateLimit: 50000,
      },
      pageConfig: {
        title: blogTitle,
      },
      auth: {
        adminKey,
      },
      _runtime: {
        ready: true,
      },
    })
  },
})
