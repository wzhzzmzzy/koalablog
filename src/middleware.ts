import { createAuth } from '@/lib/services/auth'
import { defineMiddleware } from 'astro:middleware'
import { globalConfig } from './lib/kv'

export const onRequest = defineMiddleware(async (ctx, next) => {
  const config = await globalConfig(ctx.locals.runtime.env.KOALA)

  if (!config.onboardingFinished && ctx.url.pathname !== '/onboarding') {
    return ctx.redirect('/onboarding')
  }

  const auth = createAuth({
    type: import.meta.env.DATA_SOURCE || 'sqlite',
    DB: ctx.locals.runtime.env.DB,
  })
  console.log('auth!', ctx.request.headers)
  const isAuthed = await auth.api
    .getSession({
      headers: ctx.request.headers,
    })

  console.log('auth', isAuthed)

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
