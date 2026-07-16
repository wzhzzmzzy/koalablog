import type { LegacyFileRow, MigrationPreservationManifest } from '@/lib/files/migration-audit'
import { createHash } from 'node:crypto'
import { constants, copyFile, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { auditLegacyFileRows } from '@/lib/files/migration-audit'
import { sql } from 'drizzle-orm'
import { drizzle as drizzleSqlite } from 'drizzle-orm/libsql'
import { markdown } from './schema'

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
      id: markdown.id,
      source: markdown.source,
      link: markdown.link,
      subject: markdown.subject,
      content: markdown.content,
      tags: markdown.tags,
      incoming_links: markdown.incoming_links,
      outgoing_links: markdown.outgoing_links,
      private: markdown.private,
      remoteTruth: markdown.remoteTruth,
      createdAt: markdown.createdAt,
      updatedAt: markdown.updatedAt,
      deletedAt: markdown.deletedAt,
    })
    .from(markdown)
    .orderBy(markdown.id)
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
