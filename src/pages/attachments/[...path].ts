import type { APIRoute } from 'astro'

export const GET: APIRoute = (ctx) => {
  const { path } = ctx.params

  if (!path) {
    return new Response('Not Found', { status: 404 })
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: `/api/oss/attachments_${path}`,
    },
  })
}