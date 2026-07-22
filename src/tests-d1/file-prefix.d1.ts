import { add, readByPrefix } from '@/db/markdown'
import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import legacySchema from '../../migrations/0000_init.sql?raw'
import sourceMigration from '../../migrations/0002_file_source_schema.sql?raw'

function statements(sql: string) {
  return sql.split('--> statement-breakpoint').map(statement => statement.trim()).filter(Boolean)
}

describe('D1 File Prefix refresh', () => {
  beforeEach(async () => {
    await env.DB.prepare('DROP TABLE IF EXISTS markdown').run()
    for (const statement of statements(legacySchema).filter(statement => statement.includes('markdown')))
      await env.DB.prepare(statement).run()
    for (const statement of statements(sourceMigration))
      await env.DB.prepare(statement).run()
  })

  it('returns only Files directly under the Prefix', async () => {
    await add(env, { path: '/root', content: 'root' })
    await add(env, { path: '/project/inside', content: 'inside' })
    await add(env, { path: '/project/nested/deep', content: 'deep' })
    await add(env, { path: '/project/nested/deeper/hidden', content: 'hidden' })

    const rootFiles = await readByPrefix(env, '/')
    const projectFiles = await readByPrefix(env, '/project/')

    expect(rootFiles.map(file => file.path).sort()).toEqual([
      '/root',
    ])
    expect(projectFiles.map(file => file.path).sort()).toEqual([
      '/project/inside',
    ])
  })
})
