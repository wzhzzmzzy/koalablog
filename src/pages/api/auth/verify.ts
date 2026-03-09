import type { APIRoute } from 'astro'

export const GET: APIRoute = async ({ locals }) => {
  const session = locals.session

  if (session.role === 'admin') {
    return new Response(
      JSON.stringify({
        authenticated: true,
        role: session.role,
        message: 'Successfully authenticated via Bearer Token',
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      },
    )
  }

  return new Response(
    JSON.stringify({
      authenticated: false,
      message: 'Unauthorized: Invalid or missing Bearer Token',
    }),
    {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
      },
    },
  )
}
