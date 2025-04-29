import { defineMiddleware } from 'astro:middleware'
import { authInterceptor } from './lib/auth'
import { globalConfig } from './lib/kv'

export const onRequest = defineMiddleware(async (ctx, next) => {
  const env = ctx.locals.runtime?.env || {}
  const config = await globalConfig(env)

  ctx.locals.config = config

  if (!config._runtime?.ready) {
    if (
      ctx.url.pathname !== '/onboarding'
      && !ctx.url.pathname.startsWith('/api')
    ) {
      return ctx.redirect('/onboarding')
    }
    return next()
  }

  if (ctx.url.pathname.startsWith('/dashboard') || ctx.url.pathname === '/login') {
    await authInterceptor(ctx)

    if (ctx.url.pathname === '/login' && ctx.locals.session.authed) {
      return ctx.redirect('/dashboard')
    }

    if (ctx.url.pathname.startsWith('/dashboard') && !ctx.locals.session.authed) {
      return ctx.redirect(
        `/login?from=${encodeURIComponent(ctx.url.pathname + ctx.url.search)}`,
      )
    }
  }

  return next()
})
