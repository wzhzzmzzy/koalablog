import { defineMiddleware } from 'astro:middleware'
import { authInterceptor } from './lib/auth'
import { globalConfig } from './lib/kv'

const AUTH_REQUIRED_SITE = [
  '/dashboard',
]

const AUTH_REQUIRED_API = [
  '/api/db',
  '/api/config',
  '/api/oss',
]

export const onRequest = defineMiddleware(async (ctx, next) => {
  const env = ctx.locals.runtime?.env || {}
  const pathname = ctx.url.pathname
  const config = await globalConfig(env)

  ctx.locals.config = config

  if (!config._runtime?.ready) {
    if (
      pathname !== '/onboarding'
      && !pathname.startsWith('/api')
    ) {
      return ctx.redirect('/onboarding')
    }
    return next()
  }

  const AUTH_REQUIRED_PATH = AUTH_REQUIRED_API.concat(AUTH_REQUIRED_SITE)

  if (AUTH_REQUIRED_PATH.some(path => pathname.startsWith(path)) || pathname === '/login') {
    await authInterceptor(ctx)

    if (pathname === '/login' && ctx.locals.session.authed) {
      return ctx.redirect('/dashboard')
    }

    if (!ctx.locals.session.authed) {
      if (AUTH_REQUIRED_SITE.some(path => pathname.startsWith(path))) {
        return ctx.redirect(
          `/login?from=${encodeURIComponent(ctx.url.pathname + ctx.url.search)}`,
        )
      }

      if (AUTH_REQUIRED_API.some(path => pathname.startsWith(path))) {
        return new Response(JSON.stringify({
          status: 'auth failed',
        }), {
          status: 401,
        })
      }
    }
  }

  return next()
})
