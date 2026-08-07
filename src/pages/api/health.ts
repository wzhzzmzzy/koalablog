import type { APIRoute } from 'astro'
import { connectDB } from '@/db'

export const GET: APIRoute = async ({ locals }) => {
  try {
    // Check database connection
    const db = connectDB(locals.runtime?.env)

    // Simple query to test database connectivity
    await db.query.markdown.findFirst({
      columns: { id: true },
    })

    // Get current timestamp
    const timestamp = new Date().toISOString()
    const runtimeEnv = locals.runtime?.env as Record<string, string | undefined> | undefined

    // Basic health check response
    const healthStatus = {
      status: 'healthy',
      timestamp,
      database: 'connected',
      environment: {
        dataSource: import.meta.env.DATA_SOURCE ?? runtimeEnv?.DATA_SOURCE ?? 'sqlite',
        deployMode: runtimeEnv?.DEPLOY_MODE ?? 'standalone',
        nodeEnv: import.meta.env.MODE ?? runtimeEnv?.NODE_ENV ?? 'development',
      },
      uptime: Math.floor(performance.now() / 1000),
    }

    return new Response(JSON.stringify(healthStatus), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
    })
  }
  catch (error) {
    const errorStatus = {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
      database: 'disconnected',
    }

    return new Response(JSON.stringify(errorStatus), {
      status: 503,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
    })
  }
}
