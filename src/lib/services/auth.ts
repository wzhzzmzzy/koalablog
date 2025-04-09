import type { D1Database } from '@cloudflare/workers-types'
import { connectD1, connectDB } from '@/db'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'

type Context = {
  type: 'd1'
  DB: D1Database
} | {
  type: 'sqlite'
}

export function createAuth(ctx: Context) {
  if (ctx.type === 'sqlite') {
    return betterAuth({
      advanced: {
        cookiePrefix: 'koalablog',
      },
      emailAndPassword: {
        enabled: true,
      },
      database: drizzleAdapter(connectDB(), {
        provider: 'sqlite',
      }),
    })
  }
  else {
    return betterAuth({
      advanced: {
        cookiePrefix: 'koalablog',
      },
      emailAndPassword: {
        enabled: true,
      },
      database: drizzleAdapter(connectD1(ctx.DB), {
        provider: 'sqlite',
      }),
    })
  }
}
