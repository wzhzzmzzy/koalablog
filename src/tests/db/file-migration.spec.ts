import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFile, rm, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { createVerifiedSQLiteBackup, readLegacyFileRowsFromSQLite } from '@/db/file-migration'
import { markdown } from '@/db/schema'
import * as schema from '@/db/schema'
import { blockingLegacyFileRows } from '@/tests/fixtures/file-migration'
import { sql } from 'drizzle-orm'
import { drizzle as drizzleSqlite } from 'drizzle-orm/libsql'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

describe('file migration database seam', () => {
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

  it('reads the complete legacy migration shape without mutating the source table', async () => {
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

  it('creates and verifies a consistent SQLite backup plus restore rehearsal manifest', async () => {
    const manifest = await createVerifiedSQLiteBackup({
      sourceDatabasePath: databasePath,
      backupDatabasePath: backupPath,
      rehearsalDatabasePath: rehearsalPath,
      maintenanceConfirmed: true,
      applicationCommit: '6b34459',
      migrationVersion: 'gate-1b-rehearsal',
      operator: 'test-operator',
      operatorTimestamp: '2026-07-16T09:00:00.000Z',
    })

    expect(manifest).toMatchObject({
      schemaVersion: 1,
      databaseKind: 'sqlite',
      verified: true,
      maintenanceConfirmed: true,
      applicationCommit: '6b34459',
      migrationVersion: 'gate-1b-rehearsal',
      operator: 'test-operator',
      operatorTimestamp: '2026-07-16T09:00:00.000Z',
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

  it('returns exit code 2 and archives blockers for an unsafe migration snapshot', async () => {
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

  it('refuses to create a SQLite backup without a confirmed maintenance boundary', async () => {
    await expect(createVerifiedSQLiteBackup({
      sourceDatabasePath: databasePath,
      backupDatabasePath: backupPath,
      rehearsalDatabasePath: rehearsalPath,
      maintenanceConfirmed: false,
      applicationCommit: '6b34459',
      migrationVersion: 'gate-1b-rehearsal',
      operator: 'test-operator',
      operatorTimestamp: '2026-07-16T09:00:00.000Z',
    })).rejects.toThrowError(/maintenance boundary/i)
  })

  it('refuses to create a SQLite backup when the source audit is blocked', async () => {
    const database = drizzleSqlite({ connection: { url: sqliteUrl }, schema })
    await database.insert(markdown).values({
      id: 42,
      source: 10,
      link: 'post/invalid.md',
      subject: 'invalid.md',
      content: 'invalid active Path',
    })

    await expect(createVerifiedSQLiteBackup({
      sourceDatabasePath: databasePath,
      backupDatabasePath: backupPath,
      rehearsalDatabasePath: rehearsalPath,
      maintenanceConfirmed: true,
      applicationCommit: '6b34459',
      migrationVersion: 'gate-1b-rehearsal',
      operator: 'test-operator',
      operatorTimestamp: '2026-07-16T09:00:00.000Z',
    })).rejects.toThrowError(/audit is blocked/i)
  })
})
