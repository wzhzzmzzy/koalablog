import { createAuth } from '@/lib/services/auth'
import { defineMiddleware } from 'astro:middleware'
import { loadWasm } from 'shiki'
import { getDataSource } from './db'
import { globalConfig } from './lib/kv'

let wasmLoaded = false

export const onRequest = defineMiddleware(async (ctx, next) => {
  if (!wasmLoaded) {
    // eslint-disable-next-line ts/ban-ts-comment
    // @ts-ignore
    await loadWasm(import('shiki/onig.wasm'))
    wasmLoaded = true
  }

  const env = ctx.locals.runtime?.env || {}
  const config = await globalConfig(env)

  if (!config.onboardingFinished) {
    if (ctx.url.pathname !== '/onboarding' && !ctx.url.pathname.startsWith('/api')) {
      return ctx.redirect('/onboarding')
    }
    return next()
  }

  const auth = createAuth({
    type: getDataSource(env) || 'sqlite',
    DB: env.DB,
    secret: env.AUTH_SECRET || 'koala-secret',
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
