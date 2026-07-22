import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFile, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'
import { createVerifiedSQLiteBackup } from '@/db/file-migration'
import { creationTemplateCatalog } from '@/db/schema'
import { DEFAULT_MEMO_TEMPLATE_V1 } from '@/lib/files/template'
import { sql } from 'drizzle-orm'
import { drizzle as drizzleSqlite } from 'drizzle-orm/libsql'
import { describe, expect, it } from 'vitest'
import { createD1SourceHashOperatorStore } from '../../../scripts/db/source-hash-maintenance-target'

const run = promisify(execFile)

describe('source Hash maintenance CLI guardrails', () => {
  it('normalizes nullable columns encoded by Wrangler JSON', async () => {
    const store = createD1SourceHashOperatorStore(
      { database: 'DB', mode: 'local', persistTo: '/private/tmp/explicit-d1' },
      async () => [{
        id: 1,
        renderer: 'markdown',
        content: '',
        sourceHash: 'null',
        sourceHashIsNull: 1,
        revision: 1,
        deletedAt: 'null',
        deletedAtIsNull: 1,
      }],
    )

    await expect(store.readAuditBatch(0, 1)).resolves.toEqual([{
      id: 1,
      renderer: 'markdown',
      content: '',
      sourceHash: null,
      revision: 1,
      deletedAt: null,
    }])
  })

  it('refuses SQLite maintenance without backup proof and maintenance confirmation', async () => {
    const command = run('node', [
      '--import',
      'tsx',
      'scripts/db/source-hash-backfill.ts',
      '--sqlite',
      '/private/tmp/explicit-koalablog.db',
      '--output',
      '/private/tmp/source-hash-maintenance-report.json',
      '--commit',
      'deadbeef',
      '--migration-stage',
      '0003',
      '--operator',
      'test-operator',
      '--timestamp',
      '2026-07-22T10:00:00.000Z',
      '--batch-size',
      '100',
    ], { cwd: process.cwd() })

    await expect(command).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringMatching(/backup-manifest.*maintenance-confirmed/i),
    })
  }, 15_000)

  it('refuses remote D1 maintenance without exact target authorization', async () => {
    const command = run('node', [
      '--import',
      'tsx',
      'scripts/db/source-hash-backfill.ts',
      '--d1',
      'prod-koala',
      '--remote',
      '--output',
      '/private/tmp/source-hash-maintenance-report.json',
      '--commit',
      'deadbeef',
      '--migration-stage',
      '0003',
      '--operator',
      'test-operator',
      '--timestamp',
      '2026-07-22T10:00:00.000Z',
      '--batch-size',
      '100',
      '--maintenance-confirmed',
    ], { cwd: process.cwd() })

    await expect(command).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringMatching(/authorize-remote.*prod-koala/i),
    })
  }, 15_000)

  it('rehearses SQLite backup, Template upgrade, bounded backfill, and final audit', async () => {
    const token = randomUUID()
    const databasePath = join(tmpdir(), `koalablog-source-hash-maintenance-${token}.db`)
    const backupPath = join(tmpdir(), `koalablog-source-hash-maintenance-${token}.backup.db`)
    const rehearsalPath = join(tmpdir(), `koalablog-source-hash-maintenance-${token}.rehearsal.db`)
    const manifestPath = join(tmpdir(), `koalablog-source-hash-maintenance-${token}.backup.json`)
    const reportPath = join(tmpdir(), `koalablog-source-hash-maintenance-${token}.report.json`)
    const auditReportPath = join(tmpdir(), `koalablog-source-hash-maintenance-${token}.audit.json`)
    const database = drizzleSqlite({ connection: { url: `file:${databasePath}` }, schema: { creationTemplateCatalog } })

    try {
      const initialize = await readFile('migrations/0000_init.sql', 'utf8')
      for (const statement of initialize.split('--> statement-breakpoint').map(value => value.trim()).filter(Boolean))
        await database.run(sql.raw(statement))
      await database.run(sql`
        INSERT INTO markdown (id, source, link, subject, content)
        VALUES (41, 30, 'memo/maintenance', 'maintenance', 'hello')
      `)

      const backup = await createVerifiedSQLiteBackup({
        sourceDatabasePath: databasePath,
        backupDatabasePath: backupPath,
        rehearsalDatabasePath: rehearsalPath,
        maintenanceConfirmed: true,
        applicationCommit: 'deadbeef',
        migrationVersion: 'pre-0003',
        operator: 'test-operator',
        operatorTimestamp: '2026-07-22T10:00:00.000Z',
      })
      await writeFile(manifestPath, `${JSON.stringify(backup, null, 2)}\n`)

      for (const migrationName of [
        '0001_creation_template_catalog.sql',
        '0002_file_source_schema.sql',
        '0003_file_renderer_source_hash.sql',
      ]) {
        const migration = await readFile(`migrations/${migrationName}`, 'utf8')
        for (const statement of migration.split('--> statement-breakpoint').map(value => value.trim()).filter(Boolean))
          await database.run(sql.raw(statement))
      }
      await database.insert(creationTemplateCatalog).values({
        key: 'koala:creation-templates',
        schemaVersion: 1,
        revision: 7,
        payload: JSON.stringify([DEFAULT_MEMO_TEMPLATE_V1]),
      })

      const { stdout } = await run('node', [
        '--import',
        'tsx',
        'scripts/db/source-hash-backfill.ts',
        '--sqlite',
        databasePath,
        '--backup-manifest',
        manifestPath,
        '--output',
        reportPath,
        '--commit',
        'deadbeef',
        '--migration-stage',
        '0003',
        '--operator',
        'test-operator',
        '--timestamp',
        '2026-07-22T10:30:00.000Z',
        '--batch-size',
        '1',
        '--maintenance-confirmed',
      ], { cwd: process.cwd() })

      const report = JSON.parse(await readFile(reportPath, 'utf8'))
      const [source] = await database.all<Record<string, unknown>>(sql.raw('SELECT renderer, content, sourceHash, revision FROM markdown WHERE id = 41'))
      const [catalog] = await database.all<Record<string, unknown>>(sql.raw(`SELECT schemaVersion, revision, payload FROM creation_template_catalog WHERE key = 'koala:creation-templates'`))

      expect(stdout).toContain('Source Hash maintenance READY')
      expect(report).toMatchObject({
        schemaVersion: 1,
        status: 'ready',
        target: { kind: 'sqlite', database: databasePath },
        applicationCommit: 'deadbeef',
        migrationStage: '0003',
        templateCatalog: { status: 'upgraded', previousRevision: 7, currentRevision: 8 },
        backfill: {
          batches: 2,
          counts: { processed: 1, updated: 1, skipped: 0, invalid: 0, retried: 0 },
          skippedRevisions: [],
        },
        audit: { status: 'ready', summary: { total: 1, current: 1, missing: 0, mismatched: 0, invalid: 0 } },
      })
      expect(source).toMatchObject({ renderer: 'markdown', content: 'hello', revision: 1 })
      expect(source.sourceHash).toMatch(/^[a-f0-9]{64}$/)
      expect(catalog).toMatchObject({ schemaVersion: 2, revision: 8 })
      expect(JSON.parse(catalog.payload as string)).toEqual([
        expect.objectContaining({ id: 'memo-default', renderer: 'markdown' }),
      ])

      const { stdout: auditStdout } = await run('node', [
        '--import',
        'tsx',
        'scripts/db/source-hash-audit.ts',
        '--sqlite',
        databasePath,
        '--backup-manifest',
        manifestPath,
        '--output',
        auditReportPath,
        '--commit',
        'deadbeef',
        '--migration-stage',
        '0003',
        '--operator',
        'test-operator',
        '--timestamp',
        '2026-07-22T10:45:00.000Z',
        '--batch-size',
        '1',
        '--maintenance-confirmed',
      ], { cwd: process.cwd() })
      const auditEvidence = JSON.parse(await readFile(auditReportPath, 'utf8'))

      expect(auditStdout).toContain('Source Hash audit READY')
      expect(auditEvidence).toMatchObject({
        schemaVersion: 1,
        status: 'ready',
        target: { kind: 'sqlite', database: databasePath },
        applicationCommit: 'deadbeef',
        migrationStage: '0003',
        maintenanceConfirmed: true,
        audit: { status: 'ready', summary: { total: 1, current: 1 } },
      })
      expect(auditEvidence).not.toHaveProperty('backfill')
      expect(auditEvidence).not.toHaveProperty('templateCatalog')
    }
    finally {
      await Promise.all([
        unlink(databasePath).catch(() => undefined),
        unlink(backupPath).catch(() => undefined),
        unlink(rehearsalPath).catch(() => undefined),
        unlink(manifestPath).catch(() => undefined),
        unlink(reportPath).catch(() => undefined),
        unlink(auditReportPath).catch(() => undefined),
      ])
    }
  }, 15_000)
})
