import { env } from 'cloudflare:test'
import { sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { connectD1 } from '@/db'
import { resetD1ForOnboarding } from '@/db/onboarding'
import initSql from '../../migrations/0000_init.sql?raw'
import memoRemapSql from '../../migrations/0001_memo_source_remap.sql?raw'
import userSchemaSql from '../../migrations/0002_user.sql?raw'

describe('D1 onboarding reset', () => {
  it('replays the single initialization migration on a repeated incomplete onboarding visit', async () => {
    await resetD1ForOnboarding(env, [initSql])
    await resetD1ForOnboarding(env, [initSql])

    const tables = await connectD1(env.DB).all<{ name: string }>(sql.raw(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'markdown_render'`,
    ))
    expect(tables).toEqual([{ name: 'markdown_render' }])
  })

  it('replays the full migration chain including the user schema on a repeated visit', async () => {
    await resetD1ForOnboarding(env, [initSql, memoRemapSql, userSchemaSql])
    await resetD1ForOnboarding(env, [initSql, memoRemapSql, userSchemaSql])

    const tables = await connectD1(env.DB).all<{ name: string }>(sql.raw(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('user', 'api_token') ORDER BY name`,
    ))
    expect(tables).toEqual([{ name: 'api_token' }, { name: 'user' }])
  })
})
