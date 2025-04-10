import { createAuth } from '@/lib/services/auth'
import { defineMiddleware } from 'astro:middleware'
import { getDataSource } from './db'
import { globalConfig } from './lib/kv'

export const onRequest = defineMiddleware(async (ctx, next) => {
  const config = await globalConfig(ctx.locals.runtime.env.KOALA)

  if (!config.onboardingFinished) {
    if (ctx.url.pathname !== '/onboarding' && !ctx.url.pathname.startsWith('/api')) {
      return ctx.redirect('/onboarding')
    next()
    return
  }

  const auth = createAuth({
    type: getDataSource(ctx.locals.runtime.env) || 'sqlite',
    DB: ctx.locals.runtime.env.DB,
    secret: ctx.locals.runtime.env.AUTH_SECRET || 'koala-secret',
  })
  const isAuthed = await auth.api
    .getSession({
      headers: ctx.request.headers,
    })

  if (isAuthed) {
    ctx.locals.user = isAuthed.user
    ctx.locals.session = isAuthed.session
  }
  else {
    ctx.locals.user = null
    ctx.locals.session = null
  }

  if (ctx.url.pathname === '/dashboard' && !isAuthed) {
    return ctx.redirect(`/login?from=${encodeURIComponent(ctx.url.pathname + ctx.url.search)}`)
  }

  return next()
})
