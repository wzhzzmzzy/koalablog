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

const CSRF_CONTENT_TYPES = ['multipart/form-data', 'application/x-www-form-urlencoded']

function checkOrigin(ctx: Parameters<Parameters<typeof defineMiddleware>[0]>[0]): boolean {
  const origin = ctx.request.headers.get('Origin')
  if (!origin) return true

  try {
    const originUrl = new URL(origin)
    return originUrl.host === ctx.url.host
  } catch {
    return false
  }
}

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

  // Custom CSRF check: only enforce for unauthenticated FormData requests
  const isAuthenticated = ctx.locals.session?.role === 'admin'
  const contentType = ctx.request.headers.get('Content-Type') || ''
  const needsCsrfCheck = CSRF_CONTENT_TYPES.some(t => contentType.startsWith(t))

  if (needsCsrfCheck && !isAuthenticated && !checkOrigin(ctx)) {
    return new Response('Cross-site POST form submissions are forbidden', {
      status: 403,
    })
  }

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
