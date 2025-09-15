import { getActionContext } from 'astro:actions'
import { defineMiddleware } from 'astro:middleware'
import { authInterceptor } from './lib/auth'
import { SQLiteBlobStorage } from './lib/blob-storage'
import { globalConfig } from './lib/kv'

const AUTH_REQUIRED_SITE = [
  '/dashboard',
]

export const onRequest = defineMiddleware(async (ctx, next) => {
  const env = ctx.locals.runtime?.env || {}
  const pathname = ctx.url.pathname
  const config = await globalConfig(env)

  ctx.locals.config = config

  // #if !CF_PAGES
  // Initialize blob storage for SQLite mode
  ctx.locals.OSS = new SQLiteBlobStorage(env)
  // #endif

  const { action } = getActionContext(ctx)

  if (action) {
    return next()
  }

  if (!config._runtime?.ready) {
    if (
      pathname !== '/onboarding'
      && !pathname.startsWith('/api')
    ) {
      return ctx.redirect('/onboarding')
    }
    return next()
  }

  if (AUTH_REQUIRED_SITE.some(path => pathname.startsWith(path)) || pathname === '/login') {
    await authInterceptor(ctx)

    if (pathname === '/login' && ctx.locals.session.authed) {
      return ctx.redirect('/dashboard')
    }

    if (!ctx.locals.session.authed && AUTH_REQUIRED_SITE.some(path => pathname.startsWith(path))) {
      return ctx.redirect(
        `/login?from=${encodeURIComponent(ctx.url.pathname + ctx.url.search)}`,
      )
    }
  }

  return next()
})
