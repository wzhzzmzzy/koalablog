import type { APIRoute } from 'astro'
import { putGlobalConfig } from '@/lib/kv'

export const POST: APIRoute = async (ctx) => {
  const { blogTitle, adminKey, adminEmail } = await ctx.request.json()

  await putGlobalConfig(ctx.locals.runtime.env.KOALA, {
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
