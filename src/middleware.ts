import { getActionContext } from 'astro:actions'
import { defineMiddleware } from 'astro:middleware'
import { authInterceptor } from './lib/auth'
// #if !CF_PAGES
import { SQLiteBlobStorage } from './lib/blob-storage'
// #endif
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

  // Identify session for all requests
  await authInterceptor(ctx)

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
    if (pathname === '/login' && ctx.locals.session.role === 'admin') {
      return ctx.redirect('/dashboard')
    }

    if (ctx.locals.session.role !== 'admin' && AUTH_REQUIRED_SITE.some(path => pathname.startsWith(path))) {
      return ctx.redirect(
        `/login?from=${encodeURIComponent(ctx.url.pathname + ctx.url.search)}`,
      )
    }
  }

  return next()
})
