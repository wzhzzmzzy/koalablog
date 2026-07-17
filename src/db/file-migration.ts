import type { LegacyFileRow, MigrationPreservationManifest } from '@/lib/files/migration-audit'
import { createHash } from 'node:crypto'
import { constants, copyFile, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { auditLegacyFileRows } from '@/lib/files/migration-audit'
import { sql } from 'drizzle-orm'
import { drizzle as drizzleSqlite } from 'drizzle-orm/libsql'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const legacyMarkdown = sqliteTable('markdown', {
  id: integer().primaryKey({ autoIncrement: true }),
  source: integer().notNull(),
  link: text().notNull(),
  subject: text().notNull(),
  content: text(),
  tags: text(),
  incoming_links: text(),
  outgoing_links: text(),
  private: integer({ mode: 'boolean' }).default(false).notNull(),
  remoteTruth: integer({ mode: 'boolean' }).default(false).notNull(),
  createdAt: integer({ mode: 'timestamp' }).default(sql`(unixepoch())`).notNull(),
  updatedAt: integer({ mode: 'timestamp' }).default(sql`(unixepoch())`).notNull(),
  deletedAt: integer({ mode: 'timestamp' }),
})

export interface SQLiteBackupOptions {
  sourceDatabasePath: string
  backupDatabasePath: string
  rehearsalDatabasePath: string
  maintenanceConfirmed: boolean
  applicationCommit: string
  migrationVersion: string
  operator: string
  operatorTimestamp: string
}

interface SQLiteDatabaseVerification {
  path: string
  integrityCheck: 'ok'
  rowCount: number
  sha256: string
  preservation: MigrationPreservationManifest
}

export interface SQLiteBackupManifestV1 {
  schemaVersion: 1
  databaseKind: 'sqlite'
  verified: true
  maintenanceConfirmed: true
  applicationCommit: string
  migrationVersion: string
  operator: string
  operatorTimestamp: string
  source: SQLiteDatabaseVerification
  backup: SQLiteDatabaseVerification
  restoreRehearsal: SQLiteDatabaseVerification
}

export async function readLegacyFileRowsFromSQLite(sqliteUrl: string): Promise<LegacyFileRow[]> {
  return drizzleSqlite({ connection: { url: sqliteUrl } })
    .select({
      id: legacyMarkdown.id,
      source: legacyMarkdown.source,
      link: legacyMarkdown.link,
      subject: legacyMarkdown.subject,
      content: legacyMarkdown.content,
      tags: legacyMarkdown.tags,
      incoming_links: legacyMarkdown.incoming_links,
      outgoing_links: legacyMarkdown.outgoing_links,
      private: legacyMarkdown.private,
      remoteTruth: legacyMarkdown.remoteTruth,
      createdAt: legacyMarkdown.createdAt,
      updatedAt: legacyMarkdown.updatedAt,
      deletedAt: legacyMarkdown.deletedAt,
    })
    .from(legacyMarkdown)
    .orderBy(legacyMarkdown.id)
}

function fileUrl(path: string): string {
  return `file:${path}`
}

async function fileSha256(path: string): Promise<string> {
  return createHash('sha256').update(await readFile(path)).digest('hex')
}

async function verifySQLiteDatabase(path: string): Promise<SQLiteDatabaseVerification> {
  const database = drizzleSqlite({ connection: { url: fileUrl(path) } })
  const integrityRows = await database.all<Record<string, string>>(sql.raw('PRAGMA integrity_check'))
  const integrity = integrityRows.flatMap(row => Object.values(row))
  if (integrity.length !== 1 || integrity[0] !== 'ok')
    throw new Error(`SQLite integrity check failed for ${path}: ${integrity.join(', ')}`)

  const rows = await readLegacyFileRowsFromSQLite(fileUrl(path))
  const report = auditLegacyFileRows(rows)
  return {
    path,
    integrityCheck: 'ok',
    rowCount: rows.length,
    sha256: await fileSha256(path),
    preservation: report.preservation,
  }
}

function samePreservation(left: SQLiteDatabaseVerification, right: SQLiteDatabaseVerification): boolean {
  return left.rowCount === right.rowCount
    && JSON.stringify(left.preservation) === JSON.stringify(right.preservation)
}

export async function createVerifiedSQLiteBackup(options: SQLiteBackupOptions): Promise<SQLiteBackupManifestV1> {
  if (!options.maintenanceConfirmed)
    throw new Error('SQLite backup requires a confirmed maintenance boundary')
  if (Number.isNaN(new Date(options.operatorTimestamp).getTime()))
    throw new Error('SQLite backup operatorTimestamp must be a valid timestamp')

  const sourcePath = resolve(options.sourceDatabasePath)
  const backupPath = resolve(options.backupDatabasePath)
  const rehearsalPath = resolve(options.rehearsalDatabasePath)
  if (new Set([sourcePath, backupPath, rehearsalPath]).size !== 3)
    throw new Error('SQLite source, backup, and rehearsal paths must be distinct')

  const sourceRows = await readLegacyFileRowsFromSQLite(fileUrl(sourcePath))
  const audit = auditLegacyFileRows(sourceRows)
  if (audit.status === 'blocked')
    throw new Error('SQLite backup refused because the File migration audit is blocked')

  const sourceDatabase = drizzleSqlite({ connection: { url: fileUrl(sourcePath) } })
  const escapedBackupPath = backupPath.replaceAll('\'', '\'\'')
  await sourceDatabase.run(sql.raw(`VACUUM INTO '${escapedBackupPath}'`))
  await copyFile(backupPath, rehearsalPath, constants.COPYFILE_EXCL)

  const [source, backup, restoreRehearsal] = await Promise.all([
    verifySQLiteDatabase(sourcePath),
    verifySQLiteDatabase(backupPath),
    verifySQLiteDatabase(rehearsalPath),
  ])
  if (!samePreservation(source, backup) || !samePreservation(source, restoreRehearsal))
    throw new Error('SQLite backup or restore rehearsal did not preserve the migration manifest')
  if (backup.sha256 !== restoreRehearsal.sha256)
    throw new Error('SQLite restore rehearsal does not match the backup file')

  return {
    schemaVersion: 1,
    databaseKind: 'sqlite',
    verified: true,
    maintenanceConfirmed: true,
    applicationCommit: options.applicationCommit,
    migrationVersion: options.migrationVersion,
    operator: options.operator,
    operatorTimestamp: new Date(options.operatorTimestamp).toISOString(),
    source,
    backup,
    restoreRehearsal,
  }
}

function migrationStatements(migrationSql: string) {
  return migrationSql
    .split('--> statement-breakpoint')
    .map(statement => statement.trim())
    .filter(Boolean)
}

function timestampSeconds(value: LegacyFileRow['createdAt'] | null): number | null {
  if (value === null)
    return null
  const date = value instanceof Date ? value : new Date(value)
  return Math.floor(date.getTime() / 1000)
}

export async function migrateSQLiteFileSourceSchema(sqliteUrl: string, migrationSql: string) {
  const rows = await readLegacyFileRowsFromSQLite(sqliteUrl)
  const audit = auditLegacyFileRows(rows)
  if (audit.status === 'blocked')
    return { status: 'blocked' as const, audit }

  const projections = new Map(audit.projectedRows.map(row => [row.id, row]))
  const database = drizzleSqlite({ connection: { url: sqliteUrl } })
  await database.transaction(async (transaction) => {
    for (const statement of migrationStatements(migrationSql))
      await transaction.run(sql.raw(statement))

    const migrated = await transaction.all<Record<string, unknown>>(sql.raw('SELECT * FROM markdown ORDER BY id'))
    if (migrated.length !== rows.length)
      throw new Error(`Gate 1C migration row count mismatch: ${rows.length} -> ${migrated.length}`)

    for (let index = 0; index < rows.length; index++) {
      const before = rows[index]
      const after = migrated[index]
      const projection = projections.get(before.id)
      const preserved = after.id === before.id
        && after.source === before.source
        && after.content === before.content
        && after.tags === before.tags
        && after.incoming_links === before.incoming_links
        && Boolean(after.private) === Boolean(before.private)
        && Boolean(after.remoteTruth) === Boolean(before.remoteTruth)
        && after.createdAt === timestampSeconds(before.createdAt)
        && after.updatedAt === timestampSeconds(before.updatedAt)
        && after.deletedAt === timestampSeconds(before.deletedAt)
        && after.revision === 1
      const identityMatches = !projection
        || (after.path === projection.path && after.title === projection.title)
      if (!preserved || !identityMatches)
        throw new Error(`Gate 1C migration verification failed for File ID ${before.id}`)
    }

    const integrity = await transaction.all<Record<string, string>>(sql.raw('PRAGMA integrity_check'))
    if (integrity.flatMap(row => Object.values(row)).join(',') !== 'ok')
      throw new Error('Gate 1C migration failed SQLite integrity_check')
  })

  return { status: 'migrated' as const, rowCount: rows.length, audit }
}
