import type { APIRoute } from 'astro'
import { putGlobalConfig } from '@/lib/kv'

export const POST: APIRoute = async (ctx) => {
  const { blogTitle, adminKey, adminEmail } = await ctx.request.json()

  const env = ctx.locals.runtime?.env || {}
  await putGlobalConfig(env, {
    title: blogTitle,
    adminKey,
    adminEmail,
    onboardingFinished: true,
  })

  return new Response(JSON.stringify({
    status: 'success',
  }), {
    status: 200,
  })
}
