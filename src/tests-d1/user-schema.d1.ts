import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import baselineSchema from '../../migrations/0000_init.sql?raw'
import memoRemap from '../../migrations/0001_memo_source_remap.sql?raw'
import userSchema from '../../migrations/0002_user.sql?raw'

function statements(sql: string) {
  return sql.split('--> statement-breakpoint').map(statement => statement.trim()).filter(Boolean)
}

async function runStatements(sql: string) {
  for (const statement of statements(sql))
    await env.DB.prepare(statement).run()
}

describe('user schema migration', () => {
  beforeEach(async () => {
    for (const table of ['markdown', 'markdown_render', 'creation_template_catalog', 'oss_access', 'blob_storage', 'user', 'api_token'])
      await env.DB.prepare(`DROP TABLE IF EXISTS ${table}`).run()
    await runStatements(baselineSchema)
    await runStatements(memoRemap)
  })

  it('adds the user table, api_token table, and markdown owner column', async () => {
    await runStatements(userSchema)

    const userColumns = await env.DB.prepare('PRAGMA table_info(user)').all<{ name: string }>()
    const tokenColumns = await env.DB.prepare('PRAGMA table_info(api_token)').all<{ name: string }>()
    const markdownColumns = await env.DB.prepare('PRAGMA table_info(markdown)').all<{ name: string }>()

    expect(userColumns.results.map(column => column.name)).toEqual([
      'id',
      'username',
      'passwordHash',
      'passwordSalt',
      'role',
      'createdAt',
      'updatedAt',
    ])
    expect(tokenColumns.results.map(column => column.name)).toEqual([
      'id',
      'userId',
      'tokenHash',
      'label',
      'createdAt',
    ])
    expect(markdownColumns.results.map(column => column.name)).toContain('userId')
  })
})
