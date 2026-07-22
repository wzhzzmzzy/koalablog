import { legacySourceMigrationRows, migratedSourceRows } from '@/tests/fixtures/source-hash-migration'
import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import legacySchema from '../../migrations/0000_init.sql?raw'
import fileSourceMigration from '../../migrations/0002_file_source_schema.sql?raw'
import sourceHashMigration from '../../migrations/0003_file_renderer_source_hash.sql?raw'

function statements(migration: string): string[] {
  return migration.split('--> statement-breakpoint').map(statement => statement.trim()).filter(Boolean)
}

async function runStatements(migration: string): Promise<void> {
  for (const statement of statements(migration))
    await env.DB.prepare(statement).run()
}

describe('Gate 3A D1-compatible Renderer and Source Hash migration', () => {
  beforeEach(async () => {
    await env.DB.prepare('DROP TABLE IF EXISTS markdown').run()
    for (const statement of statements(legacySchema).filter(statement => statement.includes('markdown')))
      await env.DB.prepare(statement).run()
    await runStatements(fileSourceMigration)
  })

  it('matches the SQLite projection for every File field and lifecycle state', async () => {
    for (const row of legacySourceMigrationRows) {
      await env.DB.prepare(`
        INSERT INTO markdown (
          id, source, path, title, content, tags, incoming_links, outgoing_links,
          private, remoteTruth, revision, createdAt, updatedAt, deletedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        row.id,
        row.source,
        row.path,
        row.title,
        row.content,
        row.tags,
        row.incoming_links,
        row.outgoing_links,
        row.private,
        row.remoteTruth,
        row.revision,
        row.createdAt,
        row.updatedAt,
        row.deletedAt,
      ).run()
    }

    await runStatements(sourceHashMigration)

    const columns = await env.DB.prepare('PRAGMA table_info(markdown)').all<{ name: string, notnull: number, dflt_value: string | null }>()
    const rows = await env.DB.prepare('SELECT * FROM markdown ORDER BY id').all<Record<string, unknown>>()
    const indexes = await env.DB.prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'markdown' ORDER BY name`).all<{ name: string }>()

    expect(rows.results).toEqual(migratedSourceRows)
    expect(columns.results.find(column => column.name === 'content')).toMatchObject({ notnull: 1 })
    expect(columns.results.find(column => column.name === 'renderer')).toMatchObject({ notnull: 1, dflt_value: '\'markdown\'' })
    expect(columns.results.find(column => column.name === 'sourceHash')).toMatchObject({ notnull: 0 })
    expect(indexes.results.map(index => index.name)).toEqual([
      'markdown_active_path_unique',
      'markdown_deleted_at_idx',
    ])
  })
})
