import { randomUUID } from 'node:crypto'
import { readFile, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { sql } from 'drizzle-orm'
import { drizzle as drizzleSqlite } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

let databasePath = ''
let sqliteUrl = ''

beforeEach(() => {
  databasePath = join(tmpdir(), `koalablog-migration-init-${randomUUID()}.db`)
  sqliteUrl = `file:${databasePath}`
})

afterEach(async () => {
  await unlink(databasePath).catch(() => undefined)
})

describe('fresh database migration', () => {
  it('installs the complete current schema and follow-up data migration idempotently', async () => {
    const database = drizzleSqlite({ connection: { url: sqliteUrl } })
    const journal = JSON.parse(await readFile('migrations/meta/_journal.json', 'utf8')) as { entries: unknown[] }

    expect(journal.entries).toHaveLength(2)

    await migrate(database, { migrationsFolder: 'migrations' })

    const tables = await database.all<{ name: string }>(sql.raw(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE '__drizzle_%' ORDER BY name`,
    ))
    const markdownColumns = await database.all<{ name: string, notnull: number }>(sql.raw('PRAGMA table_info(markdown)'))

    expect(tables.map(table => table.name)).toEqual([
      'blob_storage',
      'creation_template_catalog',
      'markdown',
      'markdown_render',
      'oss_access',
      'sqlite_sequence',
    ])
    expect(markdownColumns).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'renderer', notnull: 1 }),
      expect.objectContaining({ name: 'sourceHash', notnull: 1 }),
    ]))

    await database.run(sql`
      INSERT INTO markdown (id, source, path, title, content, sourceHash)
      VALUES (1, 30, '/fresh', 'fresh', '<h1>fresh</h1>', 'fresh-source-hash')
    `)
    await database.run(sql`
      INSERT INTO markdown_render (
        fileId, schemaVersion, renderer, svelteVersion, unocssVersion, unocssConfigHash,
        sourceHash, dependencies, artifactHash, javascriptResourceHash, cssResourceHash,
        javascript, css, snapshotHtml
      ) VALUES (
        1, 1, 'svelte', '5.19.2', '65.4.3', 'a', 'fresh-source-hash', '[]', 'b', 'c', 'd',
        'export {}', '', '<p>fresh</p>'
      )
    `)
    await database.run(sql.raw('DELETE FROM markdown WHERE id = 1'))
    expect(await database.all(sql.raw('SELECT * FROM markdown_render'))).toEqual([])

    const firstMigrationLog = await database.all<{ created_at: number }>(sql.raw('SELECT created_at FROM __drizzle_migrations ORDER BY created_at'))
    await migrate(database, { migrationsFolder: 'migrations' })
    const secondMigrationLog = await database.all<{ created_at: number }>(sql.raw('SELECT created_at FROM __drizzle_migrations ORDER BY created_at'))

    expect(firstMigrationLog).toHaveLength(journal.entries.length)
    expect(secondMigrationLog).toEqual(firstMigrationLog)
  })
})
