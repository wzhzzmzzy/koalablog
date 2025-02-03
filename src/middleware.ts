import { createAuth } from '@/lib/services/auth'
import { defineMiddleware } from 'astro:middleware'

export const onRequest = defineMiddleware(async (ctx, next) => {
  const auth = createAuth({
    type: import.meta.env.DB || 'sqlite',
    DB: ctx.locals.runtime.env.DB,
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
    return ctx.redirect('/login')
  }

  return next()
})
