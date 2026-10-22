import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'
import { sha256Hex } from '@/lib/svelte/artifact-hash'
import { connectDB, getDataSource } from '.'
import migrationSql from '../../migrations/0003_artifact_objects.sql?raw'

export async function artifactSchemaStatus(env: Env, includeCounts = false) {
  const db: BaseSQLiteDatabase<'async', unknown, typeof import('./schema')> = connectDB(env)
  const columns = await db.all<{ name: string }>(sql`PRAGMA table_info(markdown_render)`)
  const names = new Set(columns.map(column => column.name))
  const ready = names.has('javascriptKey') && names.has('cssKey') && !names.has('snapshotHtml')
  const [counts] = includeCounts && names.has('snapshotHtml')
    ? await db.all<{ snapshots: number, snapshotBytes: number }>(sql`SELECT COUNT(*) AS snapshots, COALESCE(SUM(length(CAST(snapshotHtml AS BLOB))), 0) AS snapshotBytes FROM markdown_render WHERE snapshotHtml <> ''`)
    : [{ snapshots: 0, snapshotBytes: 0 }]
  return { ready, columns: [...names], ...counts }
}

export async function migrateArtifactSchema(env: Env) {
  const status = await artifactSchemaStatus(env)
  if (!status.columns.length)
    throw new Error('Initialize or restore the database before migrating Artifacts')
  const statements: string[] = []
  for (const column of ['javascriptKey', 'cssKey']) {
    if (!status.columns.includes(column))
      statements.push(`ALTER TABLE markdown_render ADD COLUMN ${column} text`)
  }
  if (status.columns.includes('snapshotHtml'))
    statements.push('ALTER TABLE markdown_render DROP COLUMN snapshotHtml')
  statements.push('UPDATE markdown_render SET schemaVersion = 2 WHERE schemaVersion = 1')

  if (getDataSource(env) === 'd1' && env.DB) {
    statements.push(
      'CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL)',
      'INSERT OR IGNORE INTO d1_migrations (name) VALUES (\'0003_artifact_objects.sql\')',
    )
    await env.DB.batch(statements.map(statement => env.DB.prepare(statement)))
  }
  else {
    const db = connectDB(env)
    const hash = await sha256Hex(migrationSql)
    statements.push(
      'CREATE TABLE IF NOT EXISTS __drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric)',
      `INSERT INTO __drizzle_migrations (hash, created_at) SELECT '${hash}', 1792659600000 WHERE NOT EXISTS (SELECT 1 FROM __drizzle_migrations WHERE created_at = 1792659600000)`,
    )
    const client = db.$client
    if (!('execute' in client))
      throw new Error('SQLite migration connection is unavailable')
    await client.batch(statements, 'write')
  }
  return artifactSchemaStatus(env, true)
}
