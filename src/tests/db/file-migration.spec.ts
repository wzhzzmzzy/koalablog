import type { SQLiteBackupOptions } from '@/db/file-migration'
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFile, rm, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'
import { createVerifiedSQLiteBackup, readLegacyFileRowsFromSQLite } from '@/db/file-migration'
import { markdown } from '@/db/schema'
import * as schema from '@/db/schema'
import { auditLegacyFileRows } from '@/lib/files/migration-audit'
import { blockingLegacyFileRows, restoreConflictLegacyFixture } from '@/tests/fixtures/file-migration'
import { sql } from 'drizzle-orm'
import { drizzle as drizzleSqlite } from 'drizzle-orm/libsql'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

let databasePath = ''
let sqliteUrl = ''
let outputDirectory = ''
let backupPath = ''
let rehearsalPath = ''
let snapshotPath = ''

beforeEach(async () => {
  databasePath = join(tmpdir(), `koalablog-file-migration-${randomUUID()}.db`)
  outputDirectory = join(tmpdir(), `koalablog-file-migration-${randomUUID()}`)
  backupPath = join(tmpdir(), `koalablog-file-migration-${randomUUID()}.backup.db`)
  rehearsalPath = join(tmpdir(), `koalablog-file-migration-${randomUUID()}.rehearsal.db`)
  snapshotPath = join(tmpdir(), `koalablog-file-migration-${randomUUID()}.snapshot.json`)
  sqliteUrl = `file:${databasePath}`

  const database = drizzleSqlite({ connection: { url: sqliteUrl }, schema })
  const migration = await readFile('migrations/0000_init.sql', 'utf8')
  for (const statement of migration.split('--> statement-breakpoint').map(value => value.trim()).filter(Boolean))
    await database.run(sql.raw(statement))
  await database.insert(markdown).values({
    id: 41,
    source: 30,
    link: 'memo/私人',
    subject: '私人',
    content: 'content',
    tags: 'private,中文',
    outgoing_links: '["/about"]',
    private: true,
    remoteTruth: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  })
})

afterEach(async () => {
  await Promise.all([
    unlink(databasePath).catch(() => undefined),
    unlink(backupPath).catch(() => undefined),
    unlink(rehearsalPath).catch(() => undefined),
    unlink(snapshotPath).catch(() => undefined),
    rm(outputDirectory, { recursive: true, force: true }),
  ])
})

function backupOptions(maintenanceConfirmed: boolean): SQLiteBackupOptions {
  return {
    sourceDatabasePath: databasePath,
    backupDatabasePath: backupPath,
    rehearsalDatabasePath: rehearsalPath,
    maintenanceConfirmed,
    applicationCommit: '6b34459',
    migrationVersion: 'gate-1b-rehearsal',
    operator: 'test-operator',
    operatorTimestamp: '2026-07-16T09:00:00.000Z',
  }
}

describe('file migration database reader', () => {
  it('reads the complete legacy shape without mutating the source table', async () => {
    const before = await readLegacyFileRowsFromSQLite(sqliteUrl)
    const after = await readLegacyFileRowsFromSQLite(sqliteUrl)

    expect(before).toEqual(after)
    expect(before).toEqual([expect.objectContaining({
      id: 41,
      source: 30,
      link: 'memo/私人',
      subject: '私人',
      content: 'content',
      tags: 'private,中文',
      incoming_links: null,
      outgoing_links: '["/about"]',
      private: true,
      remoteTruth: true,
      deletedAt: null,
    })])
  })
})

describe('file migration audit CLI', () => {
  it('runs a read-only SQLite dry-run and archives both report formats', async () => {
    const before = await readLegacyFileRowsFromSQLite(sqliteUrl)
    const { stdout } = await promisify(execFile)('node', [
      '--import',
      'tsx',
      'scripts/db/file-migration-audit.ts',
      '--sqlite',
      databasePath,
      '--output',
      outputDirectory,
    ], { cwd: process.cwd() })
    const after = await readLegacyFileRowsFromSQLite(sqliteUrl)
    const json = JSON.parse(await readFile(join(outputDirectory, 'file-migration-audit.v1.json'), 'utf8'))
    const text = await readFile(join(outputDirectory, 'file-migration-audit.v1.txt'), 'utf8')

    expect(after).toEqual(before)
    expect(json).toMatchObject({ schemaVersion: 1, status: 'ready' })
    expect(text).toContain('Status: READY')
    expect(stdout).toContain('Status: READY')
  })

  it('returns exit code 2 and archives blockers for an unsafe snapshot', async () => {
    await writeFile(snapshotPath, JSON.stringify([{ success: true, results: blockingLegacyFileRows }]))
    const command = promisify(execFile)('node', [
      '--import',
      'tsx',
      'scripts/db/file-migration-audit.ts',
      '--snapshot',
      snapshotPath,
      '--output',
      outputDirectory,
    ], { cwd: process.cwd() })

    await expect(command).rejects.toMatchObject({ code: 2 })
    expect(JSON.parse(await readFile(join(outputDirectory, 'file-migration-audit.v1.json'), 'utf8'))).toMatchObject({
      status: 'blocked',
      abortReasons: [
        { code: 'active_path_collision', rowIds: [1, 2] },
        { code: 'invalid_active_path', rowIds: [5] },
      ],
    })
  })
})

describe('sqlite migration recovery', () => {
  it('creates a consistent backup plus verified restore rehearsal manifest', async () => {
    const manifest = await createVerifiedSQLiteBackup(backupOptions(true))

    expect(manifest).toMatchObject({
      schemaVersion: 1,
      databaseKind: 'sqlite',
      verified: true,
      maintenanceConfirmed: true,
      source: { path: databasePath, integrityCheck: 'ok', rowCount: 1 },
      backup: { path: backupPath, integrityCheck: 'ok', rowCount: 1 },
      restoreRehearsal: { path: rehearsalPath, integrityCheck: 'ok', rowCount: 1 },
    })
    expect(manifest.backup.sha256).toMatch(/^[a-f0-9]{64}$/)
    expect(manifest.restoreRehearsal.sha256).toBe(manifest.backup.sha256)
    expect(manifest.backup.preservation).toEqual(manifest.source.preservation)
    expect(manifest.restoreRehearsal.preservation).toEqual(manifest.source.preservation)
    expect(await readLegacyFileRowsFromSQLite(`file:${backupPath}`)).toEqual(await readLegacyFileRowsFromSQLite(sqliteUrl))
  })

  it('refuses backup without a confirmed maintenance boundary', async () => {
    await expect(createVerifiedSQLiteBackup(backupOptions(false))).rejects.toThrowError(/maintenance boundary/i)
  })

  it('refuses backup when the source audit is blocked', async () => {
    const database = drizzleSqlite({ connection: { url: sqliteUrl }, schema })
    await database.insert(markdown).values({
      id: 42,
      source: 10,
      link: 'post/invalid.md',
      subject: 'invalid.md',
      content: 'invalid active Path',
    })

    await expect(createVerifiedSQLiteBackup(backupOptions(true))).rejects.toThrowError(/audit is blocked/i)
  })
})

describe('restore conflict migration fixture', () => {
  it('fits the legacy schema and makes only a Path collision block restore after migration', async () => {
    const database = drizzleSqlite({ connection: { url: sqliteUrl }, schema })
    await database.insert(markdown).values(restoreConflictLegacyFixture.rows.map(row => ({
      ...row,
      private: Boolean(row.private),
      remoteTruth: Boolean(row.remoteTruth),
      createdAt: row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt),
      updatedAt: row.updatedAt instanceof Date ? row.updatedAt : new Date(row.updatedAt),
      deletedAt: row.deletedAt === null
        ? null
        : row.deletedAt instanceof Date ? row.deletedAt : new Date(row.deletedAt),
    })))

    const fixtureIds = new Set(restoreConflictLegacyFixture.rows.map(row => row.id))
    const report = auditLegacyFileRows((await readLegacyFileRowsFromSQLite(sqliteUrl)).filter(row => fixtureIds.has(row.id)))
    const activeRows = report.projectedRows.filter(row => row.state === 'active')
    const outcomes = restoreConflictLegacyFixture.cases.map((fixture) => {
      const recycled = report.projectedRows.find(row => row.id === fixture.recycledId)!
      const active = activeRows.find(row => row.id === fixture.activeId)!
      const pathConflict = active.path === recycled.path
      const titleConflict = active.title === recycled.title
      return {
        recycledId: fixture.recycledId,
        activeId: fixture.activeId,
        legacyConflict: pathConflict ? 'path' : titleConflict ? 'title_only' : 'none',
        expectedAfterMigration: pathConflict ? 'conflict' : 'restorable',
      }
    })

    expect(report.status).toBe('ready')
    expect(outcomes).toEqual(restoreConflictLegacyFixture.cases)
  })
})
