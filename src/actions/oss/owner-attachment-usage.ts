import { ActionError, defineAction } from 'astro:actions'
import { formatStorageSize, readOwnerAttachmentUsage } from '@/lib/oss/owner-attachment-usage'
import { authGuard } from '../utils/auth'

export const ownerAttachmentUsage = defineAction({
  handler: async (_, ctx) => {
    await authGuard(ctx)
    const env = ctx.locals.runtime?.env ?? {} as Env
    const storage = ctx.locals.OSS || ctx.locals.runtime?.env.OSS
    if (!storage) {
      throw new ActionError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Object storage is unavailable',
      })
    }

    const snapshot = await readOwnerAttachmentUsage(env, storage)
    return {
      generatedAt: snapshot.generatedAt,
      users: snapshot.users.map(usage => ({
        ...usage,
        formattedBytes: formatStorageSize(usage.bytes),
      })),
    }
  },
})
