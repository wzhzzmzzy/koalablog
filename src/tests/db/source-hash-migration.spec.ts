import type { LegacySourceMigrationRow } from '@/tests/fixtures/source-hash-migration'
import { randomUUID } from 'node:crypto'
import { readFile, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runSourceHashBackfillBatch, runStoredSourceHashAudit } from '@/db/source-hash-maintenance'
import { calculateSourceHash } from '@/lib/files/source-hash'
import { legacySourceMigrationRows, migratedSourceRows } from '@/tests/fixtures/source-hash-migration'
import { sql } from 'drizzle-orm'
import { drizzle as drizzleSqlite } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createSQLiteSourceHashOperatorStore } from '../../../scripts/db/source-hash-maintenance-target'

const FILE_SOURCE_MIGRATION_MILLIS = 1_784_201_001_945

let databasePath = ''
let sqliteUrl = ''

function statements(migration: string): string[] {
  return migration.split('--> statement-breakpoint').map(statement => statement.trim()).filter(Boolean)
}

function connect() {
  return drizzleSqlite({ connection: { url: sqliteUrl } })
}

async function applyMigration(database: ReturnType<typeof drizzleSqlite>, path: string): Promise<void> {
  const migration = await readFile(path, 'utf8')
  for (const statement of statements(migration))
    await database.run(sql.raw(statement))
}

async function applyThroughFileSourceMigration(database: ReturnType<typeof drizzleSqlite>): Promise<void> {
  await applyMigration(database, 'migrations/0000_init.sql')
  await applyMigration(database, 'migrations/0001_creation_template_catalog.sql')
  await applyMigration(database, 'migrations/0002_file_source_schema.sql')
}

async function insertLegacyRows(database: ReturnType<typeof drizzleSqlite>, rows: LegacySourceMigrationRow[]): Promise<void> {
  for (const row of rows) {
    await database.run(sql`
      INSERT INTO markdown (
        id, source, path, title, content, tags, incoming_links, outgoing_links,
        private, remoteTruth, revision, createdAt, updatedAt, deletedAt
      ) VALUES (
        ${row.id}, ${row.source}, ${row.path}, ${row.title}, ${row.content}, ${row.tags},
        ${row.incoming_links}, ${row.outgoing_links}, ${row.private}, ${row.remoteTruth},
        ${row.revision}, ${row.createdAt}, ${row.updatedAt}, ${row.deletedAt}
      )
    `)
  }
}

beforeEach(() => {
  databasePath = join(tmpdir(), `koalablog-source-hash-migration-${randomUUID()}.db`)
  sqliteUrl = `file:${databasePath}`
})

afterEach(async () => {
  await unlink(databasePath).catch(() => undefined)
})

describe('gate 3A Renderer and Source Hash migration', () => {
  it('preserves every File field, lifecycle state, duplicate recycled Path, and active indexes', async () => {
    const database = connect()
    await applyThroughFileSourceMigration(database)
    await insertLegacyRows(database, legacySourceMigrationRows)

    await applyMigration(database, 'migrations/0003_file_renderer_source_hash.sql')

    const rows = await database.all<Record<string, unknown>>(sql.raw('SELECT * FROM markdown ORDER BY id'))
    const columns = await database.all<{ name: string, notnull: number, dflt_value: string | null }>(sql.raw('PRAGMA table_info(markdown)'))
    const indexes = await database.all<{ name: string }>(sql.raw(`SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'markdown' ORDER BY name`))
    const integrity = await database.all<{ integrity_check: string }>(sql.raw('PRAGMA integrity_check'))

    expect(rows).toEqual(migratedSourceRows)
    expect(columns.find(column => column.name === 'content')).toMatchObject({ notnull: 1 })
    expect(columns.find(column => column.name === 'renderer')).toMatchObject({ notnull: 1, dflt_value: '\'markdown\'' })
    expect(columns.find(column => column.name === 'sourceHash')).toMatchObject({ notnull: 0 })
    expect(indexes.map(index => index.name)).toEqual([
      'markdown_active_path_unique',
      'markdown_deleted_at_idx',
    ])
    expect(integrity).toEqual([{ integrity_check: 'ok' }])

    await expect(database.run(sql`
      INSERT INTO markdown (source, path, title, content)
      VALUES (30, '/memo/shared', 'shared', 'active replacement')
    `)).rejects.toThrow(/UNIQUE constraint failed/)
    await expect(database.run(sql`
      INSERT INTO markdown (source, path, title, content, deletedAt)
      VALUES (30, '/memo/shared', 'shared', 'another recycled File', 1770000001)
    `)).resolves.toBeDefined()
    await expect(database.run(sql`
      INSERT INTO markdown (source, path, title, content)
      VALUES (30, '/memo/null', 'null', ${null})
    `)).rejects.toThrow(/NOT NULL constraint failed/)
  })

  it('refuses to require Source Hash while any File is still missing one', async () => {
    const database = connect()
    await applyThroughFileSourceMigration(database)
    await applyMigration(database, 'migrations/0003_file_renderer_source_hash.sql')
    await database.run(sql`
      INSERT INTO markdown (id, source, path, title, content)
      VALUES (51, 30, '/missing-hash', 'missing-hash', 'content')
    `)
    const migration = await readFile('migrations/0004_require_source_hash.sql', 'utf8')

    await expect(database.transaction(async (transaction) => {
      for (const statement of statements(migration))
        await transaction.run(sql.raw(statement))
    })).rejects.toThrow(/NOT NULL constraint failed/)

    const columns = await database.all<{ name: string, notnull: number }>(sql.raw('PRAGMA table_info(markdown)'))
    const [row] = await database.all<Record<string, unknown>>(sql.raw('SELECT id, sourceHash FROM markdown WHERE id = 51'))
    expect(columns.find(column => column.name === 'sourceHash')).toMatchObject({ notnull: 0 })
    expect(row).toEqual({ id: 51, sourceHash: null })
  })
})

describe('gate 3A Source Hash backfill and non-null migration', () => {
  it('converges from 0003 through backfill to the non-null Source Hash schema', async () => {
    const database = connect()
    await applyThroughFileSourceMigration(database)
    await insertLegacyRows(database, legacySourceMigrationRows)
    await applyMigration(database, 'migrations/0003_file_renderer_source_hash.sql')

    const store = createSQLiteSourceHashOperatorStore(databasePath)
    try {
      const first = await runSourceHashBackfillBatch(store, { afterId: 0, limit: 2 })
      const second = await runSourceHashBackfillBatch(store, { afterId: first.nextAfterId, limit: 2 })
      expect(first.counts.updated + second.counts.updated).toBe(legacySourceMigrationRows.length)
      await expect(runStoredSourceHashAudit(store, 2)).resolves.toMatchObject({ status: 'ready' })
    }
    finally {
      store.close()
    }

    await applyMigration(database, 'migrations/0004_require_source_hash.sql')

    const rows = await database.all<Record<string, unknown>>(sql.raw('SELECT * FROM markdown ORDER BY id'))
    const expected = await Promise.all(migratedSourceRows.map(async row => ({
      ...row,
      sourceHash: await calculateSourceHash(row.renderer, row.content),
    })))
    const columns = await database.all<{ name: string, notnull: number }>(sql.raw('PRAGMA table_info(markdown)'))
    const indexes = await database.all<{ name: string }>(sql.raw(`SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'markdown' ORDER BY name`))

    expect(rows).toEqual(expected)
    expect(columns.find(column => column.name === 'sourceHash')).toMatchObject({ notnull: 1 })
    expect(indexes.map(index => index.name)).toEqual([
      'markdown_active_path_unique',
      'markdown_deleted_at_idx',
    ])
  })

  it('installs from empty and treats a second Drizzle migrator run as a no-op', async () => {
    const database = connect()

    await migrate(database, { migrationsFolder: 'migrations' })
    await database.run(sql`
      INSERT INTO markdown (id, source, path, title, content, sourceHash)
      VALUES (51, 30, '/fresh', 'fresh', '<h1>fresh</h1>', 'fresh-source-hash')
    `)

    const [freshRow] = await database.all<Record<string, unknown>>(sql.raw('SELECT * FROM markdown WHERE id = 51'))
    const columns = await database.all<{ name: string, notnull: number }>(sql.raw('PRAGMA table_info(markdown)'))
    const firstMigrationLog = await database.all<{ created_at: number }>(sql.raw('SELECT created_at FROM __drizzle_migrations ORDER BY created_at'))
    expect(freshRow).toMatchObject({ renderer: 'markdown', sourceHash: 'fresh-source-hash', content: '<h1>fresh</h1>' })
    expect(columns.find(column => column.name === 'sourceHash')).toMatchObject({ notnull: 1 })
    expect(firstMigrationLog).toHaveLength(5)
    await expect(database.run(sql`
      INSERT INTO markdown (source, path, title, content)
      VALUES (30, '/missing', 'missing', 'missing hash')
    `)).rejects.toThrow(/NOT NULL constraint failed/)

    await database.run(sql`
      UPDATE markdown
      SET renderer = 'svelte', sourceHash = 'saved-source-hash'
      WHERE id = 51
    `)
    await migrate(database, { migrationsFolder: 'migrations' })

    const [afterSecondRun] = await database.all<Record<string, unknown>>(sql.raw('SELECT * FROM markdown WHERE id = 51'))
    const secondMigrationLog = await database.all<{ created_at: number }>(sql.raw('SELECT created_at FROM __drizzle_migrations ORDER BY created_at'))
    const integrity = await database.all<{ integrity_check: string }>(sql.raw('PRAGMA integrity_check'))
    expect(afterSecondRun).toMatchObject({ renderer: 'svelte', sourceHash: 'saved-source-hash', content: '<h1>fresh</h1>' })
    expect(secondMigrationLog).toEqual(firstMigrationLog)
    expect(integrity).toEqual([{ integrity_check: 'ok' }])
  })
})

describe('gate 3A migration runner behavior', () => {
  it('rolls back a failed migrator batch and does not record 0003 as applied', async () => {
    const database = connect()
    await applyThroughFileSourceMigration(database)
    await insertLegacyRows(database, [legacySourceMigrationRows[1]])
    await database.run(sql.raw('DROP INDEX markdown_active_path_unique'))
    await database.run(sql.raw('CREATE TABLE migration_guard (value text NOT NULL)'))
    await database.run(sql.raw('CREATE UNIQUE INDEX markdown_active_path_unique ON migration_guard (value)'))
    await database.run(sql.raw(`
      CREATE TABLE __drizzle_migrations (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL,
        created_at numeric
      )
    `))
    await database.run(sql`
      INSERT INTO __drizzle_migrations (hash, created_at)
      VALUES ('0002-fixture', ${FILE_SOURCE_MIGRATION_MILLIS})
    `)

    await expect(
      migrate(database, { migrationsFolder: 'migrations' }),
    ).rejects.toThrow(/index markdown_active_path_unique already exists/)

    const rows = await database.all<Record<string, unknown>>(sql.raw('SELECT * FROM markdown ORDER BY id'))
    const columns = await database.all<{ name: string }>(sql.raw('PRAGMA table_info(markdown)'))
    const migrationLog = await database.all<{ created_at: number }>(sql.raw('SELECT created_at FROM __drizzle_migrations ORDER BY created_at'))
    const integrity = await database.all<{ integrity_check: string }>(sql.raw('PRAGMA integrity_check'))
    expect(rows).toEqual([legacySourceMigrationRows[1]])
    expect(columns.map(column => column.name)).not.toContain('renderer')
    expect(columns.map(column => column.name)).not.toContain('sourceHash')
    expect(migrationLog).toEqual([{ created_at: FILE_SOURCE_MIGRATION_MILLIS }])
    expect(integrity).toEqual([{ integrity_check: 'ok' }])
  })
})
