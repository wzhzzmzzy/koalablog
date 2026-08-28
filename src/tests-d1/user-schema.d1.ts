import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import { listUsersWithFileStats } from '@/db/user'
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

  it('returns active Public and Private File counts for every User', async () => {
    await runStatements(userSchema)
    await env.DB.prepare(`
      INSERT INTO user (id, username, passwordHash, passwordSalt, role) VALUES
        (1, 'admin', 'hash', 'salt', 'admin'),
        (2, 'empty', 'hash', 'salt', 'member')
    `).run()
    await env.DB.prepare(`
      INSERT INTO markdown (source, path, title, content, sourceHash, private, deletedAt, userId) VALUES
        (10, '/public', 'public', '', 'a', 0, NULL, 1),
        (30, '/private', 'private', '', 'b', 1, NULL, 1),
        (30, '/trashed', 'trashed', '', 'c', 1, unixepoch(), 1)
    `).run()

    await expect(listUsersWithFileStats(env)).resolves.toEqual([
      { id: 1, username: 'admin', role: 'admin', publicFileCount: 1, privateFileCount: 1 },
      { id: 2, username: 'empty', role: 'member', publicFileCount: 0, privateFileCount: 0 },
    ])
  })
})
