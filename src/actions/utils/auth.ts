import { readAnyById } from '@/db/markdown'
import { incrementToday } from '@/db/ossAccess'
import { authInterceptor } from '@/lib/auth'
import { type ActionAPIContext, ActionError } from 'astro:actions'

export async function authGuard(ctx: ActionAPIContext) {
  await authInterceptor(ctx)

  if (ctx.locals.session.role !== 'admin') {
    throw new ActionError({
      code: 'UNAUTHORIZED',
    })
  }
}

export async function loginGuard(ctx: ActionAPIContext) {
  await authInterceptor(ctx)

  if (!ctx.locals.session.userId) {
    throw new ActionError({
      code: 'UNAUTHORIZED',
    })
  }
}

export async function ownerGuard(ctx: ActionAPIContext, fileId: number) {
  await loginGuard(ctx)

  const file = await readAnyById(ctx.locals.runtime?.env || ({} as Env), fileId)
  if (!file || file.userId !== ctx.locals.session.userId) {
    throw new ActionError({
      code: 'NOT_FOUND',
      message: 'File not found',
    })
  }
  return file
}

export async function ossGuard(ctx: ActionAPIContext) {
  const operateLimit = ctx.locals.config.oss.operateLimit || 0
  const accessToday = await incrementToday(ctx.locals.runtime?.env, operateLimit, 'operate')

  const operateTimes = accessToday[0]?.operateTimes || 0
  if (operateTimes >= operateLimit) {
    throw new ActionError({
      code: 'TOO_MANY_REQUESTS',
      message: `Operate reached limit today, times:${operateTimes}, limit:${operateLimit}`,
    })
  }
}

export function guards(promises: Promise<void>[]) {
  return Promise.all(promises)
}
