import { connectD1 } from '@/db'
import { resetD1ForOnboarding } from '@/db/onboarding'
import { env } from 'cloudflare:test'
import { sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import initSql from '../../migrations/0000_init.sql?raw'

describe('D1 onboarding reset', () => {
  it('replays the single initialization migration on a repeated incomplete onboarding visit', async () => {
    await resetD1ForOnboarding(env, [initSql])
    await resetD1ForOnboarding(env, [initSql])

    const tables = await connectD1(env.DB).all<{ name: string }>(sql.raw(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'markdown_render'`,
    ))
    expect(tables).toEqual([{ name: 'markdown_render' }])
  })
})
