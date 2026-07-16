import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import legacySchema from '../../migrations/0000_init.sql?raw'
import sourceMigration from '../../migrations/0002_file_source_schema.sql?raw'

function statements(sql: string) {
  return sql.split('--> statement-breakpoint').map(statement => statement.trim()).filter(Boolean)
}

async function runStatements(sql: string) {
  for (const statement of statements(sql))
    await env.DB.prepare(statement).run()
}

describe('Gate 1C D1-compatible source migration', () => {
  beforeEach(async () => {
    await env.DB.prepare('DROP TABLE IF EXISTS markdown').run()
    for (const statement of statements(legacySchema).filter(statement => statement.includes('markdown')))
      await env.DB.prepare(statement).run()
  })

  it('replaces legacy identity while preserving active and recycled rows', async () => {
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO markdown (id, source, link, subject, content, outgoing_links, private, remoteTruth, createdAt, updatedAt, deletedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(1, 10, 'post/shared', 'Current headline', 'active', '[{"subject":"wiki","link":"wiki/shared"}]', 0, 1, 1_767_225_600, 1_767_312_000, null),
      env.DB.prepare(`
        INSERT INTO markdown (id, source, link, subject, content, private, remoteTruth, createdAt, updatedAt, deletedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(2, 31, 'wiki/shared', 'Archived headline', 'recycled', 1, 0, 1_767_225_600, 1_767_312_000, 1_770_000_000),
    ])

    await runStatements(sourceMigration)

    const columns = await env.DB.prepare('PRAGMA table_info(markdown)').all<{ name: string }>()
    const rows = await env.DB.prepare('SELECT * FROM markdown ORDER BY id').all<Record<string, unknown>>()
    const indexes = await env.DB.prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'markdown' ORDER BY name`).all<{ name: string }>()

    expect(columns.results.map(column => column.name)).toEqual([
      'id',
      'source',
      'path',
      'title',
      'content',
      'tags',
      'incoming_links',
      'outgoing_links',
      'private',
      'remoteTruth',
      'revision',
      'createdAt',
      'updatedAt',
      'deletedAt',
    ])
    expect(rows.results).toEqual([
      expect.objectContaining({ id: 1, path: '/post/shared', title: 'shared', outgoing_links: '["/wiki/shared"]', revision: 1, remoteTruth: 1 }),
      expect.objectContaining({ id: 2, path: '/wiki/shared', title: 'shared', revision: 1, private: 1 }),
    ])
    expect(indexes.results.map(index => index.name)).toEqual([
      'markdown_active_path_unique',
      'markdown_deleted_at_idx',
    ])
  })
})
