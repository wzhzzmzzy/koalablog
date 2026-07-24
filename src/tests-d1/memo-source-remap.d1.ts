import { MarkdownSource } from '@/db'
import { readAll, readByPath } from '@/db/markdown'
import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import legacySchema from '../../migrations/0000_init.sql?raw'
import sourceSchema from '../../migrations/0002_file_source_schema.sql?raw'
import memoRemap from '../../migrations/0003_memo_source_remap.sql?raw'

function statements(sql: string) {
  return sql.split('--> statement-breakpoint').map(statement => statement.trim()).filter(Boolean)
}

async function runStatements(sql: string) {
  for (const statement of statements(sql))
    await env.DB.prepare(statement).run()
}

describe('memo Source remap migration', () => {
  beforeEach(async () => {
    await env.DB.prepare('DROP TABLE IF EXISTS markdown').run()
    for (const statement of statements(legacySchema).filter(statement => statement.includes('markdown')))
      await env.DB.prepare(statement).run()
    await runStatements(sourceSchema)
  })

  it('remaps Page, Wiki, and Unknown sources to Memo without touching File identity', async () => {
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO markdown (id, source, path, title, content, private, remoteTruth, createdAt, updatedAt, deletedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(1, 10, '/post/hello', 'hello', 'post content', 0, 1, 1_767_225_600, 1_767_312_000, null),
      env.DB.prepare(`
        INSERT INTO markdown (id, source, path, title, content, private, remoteTruth, createdAt, updatedAt, deletedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(2, 20, '/about', 'about', 'page content', 0, 1, 1_767_225_600, 1_767_312_000, null),
      env.DB.prepare(`
        INSERT INTO markdown (id, source, path, title, content, private, remoteTruth, createdAt, updatedAt, deletedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(3, 30, '/memo/note', 'note', 'memo content', 1, 0, 1_767_225_600, 1_767_312_000, null),
      env.DB.prepare(`
        INSERT INTO markdown (id, source, path, title, content, private, remoteTruth, createdAt, updatedAt, deletedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(4, 31, '/wiki/shared', 'shared', 'wiki content', 1, 0, 1_767_225_600, 1_767_312_000, 1_770_000_000),
      env.DB.prepare(`
        INSERT INTO markdown (id, source, path, title, content, private, remoteTruth, createdAt, updatedAt, deletedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(5, 99, '/mystery', 'mystery', 'unknown content', 0, 0, 1_767_225_600, 1_767_312_000, null),
    ])

    await runStatements(memoRemap)

    const rows = await env.DB.prepare('SELECT * FROM markdown ORDER BY id').all<Record<string, unknown>>()

    expect(rows.results).toEqual([
      expect.objectContaining({ id: 1, source: 10, path: '/post/hello', title: 'hello', content: 'post content' }),
      expect.objectContaining({ id: 2, source: 30, path: '/about', title: 'about', content: 'page content', private: 0 }),
      expect.objectContaining({ id: 3, source: 30, path: '/memo/note', title: 'note', content: 'memo content', private: 1 }),
      expect.objectContaining({ id: 4, source: 30, path: '/wiki/shared', title: 'shared', deletedAt: 1_770_000_000 }),
      expect.objectContaining({ id: 5, source: 30, path: '/mystery', title: 'mystery', content: 'unknown content' }),
    ])

    const memos = await readAll(env as unknown as Env, MarkdownSource.Memo)
    expect(memos.map(file => file.path).sort()).toEqual(['/about', '/memo/note', '/mystery'])
    expect(await readByPath(env as unknown as Env, '/about')).toMatchObject({
      source: MarkdownSource.Memo,
      title: 'about',
      content: 'page content',
    })
  })
})
