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
