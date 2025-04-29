import { defineMiddleware } from 'astro:middleware'
import { globalConfig } from './lib/kv'

export const onRequest = defineMiddleware(async (ctx, next) => {
  const env = ctx.locals.runtime?.env || {}
  const config = await globalConfig(env)

  if (!config.onboardingFinished) {
    if (
      ctx.url.pathname !== '/onboarding'
      && !ctx.url.pathname.startsWith('/api')
    ) {
      return ctx.redirect('/onboarding')
    }
    return next()
  }

  if (ctx.url.pathname === '/dashboard') {
    return ctx.redirect(
      `/login?from=${encodeURIComponent(ctx.url.pathname + ctx.url.search)}`,
    )
  }

  return next()
})
