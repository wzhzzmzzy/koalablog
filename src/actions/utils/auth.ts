import { incrementToday } from '@/db/ossAccess'
import { authInterceptor } from '@/lib/auth'
import { type ActionAPIContext, ActionError } from 'astro:actions'

export async function authGuard(ctx: ActionAPIContext) {
  await authInterceptor(ctx)

  if (!ctx.locals.session.authed) {
    throw new ActionError({
      code: 'UNAUTHORIZED',
    })
  }
}

export async function ossGuard(ctx: ActionAPIContext) {
  const operateLimit = ctx.locals.config.oss.operateLimit || 0
  const accessToday = await incrementToday(ctx.locals.runtime?.env, operateLimit, 'operate')

  if ((accessToday[0]?.operateTimes || 0) >= operateLimit) {
    throw new ActionError({
      code: 'TOO_MANY_REQUESTS',
      message: 'Operate reached limit today',
    })
  }
}

export function guards(promises: Promise<void>[]) {
  return Promise.all(promises)
}
