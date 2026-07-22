import type { Client } from '@libsql/client'
import type { SourceHashMaintenanceStore } from '../../src/db/source-hash-maintenance'
import type { StoredCatalogRow } from '../../src/db/template-catalog'
import type { SourceHashAuditRow } from '../../src/lib/files/source-hash-audit'
import { Buffer } from 'node:buffer'
import { execFile } from 'node:child_process'
import { resolve } from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'
import { createClient } from '@libsql/client'

const run = promisify(execFile)

export interface SourceHashOperatorStore extends SourceHashMaintenanceStore {
  readTemplateCatalogRow: () => Promise<StoredCatalogRow | null>
  compareAndSetTemplateCatalog: (input: {
    baseRevision: number
    payload: string
  }) => Promise<boolean>
  close: () => void
}

export interface D1OperatorTarget {
  database: string
  mode: 'local' | 'remote'
  persistTo?: string
}

export type D1StatementExecutor = (
  target: D1OperatorTarget,
  statement: string,
) => Promise<Record<string, unknown>[]>

function sourceRow(row: Record<string, unknown>): SourceHashAuditRow {
  return {
    id: Number(row.id),
    renderer: row.renderer,
    content: row.content,
    sourceHash: Number(row.sourceHashIsNull) === 1 || row.sourceHash == null ? null : row.sourceHash,
    revision: Number(row.revision),
    deletedAt: Number(row.deletedAtIsNull) === 1 || row.deletedAt == null ? null : row.deletedAt,
  }
}

function createSQLiteStore(client: Client): SourceHashOperatorStore {
  return {
    readMissingBatch: async (afterId, limit) => {
      const result = await client.execute({
        sql: `SELECT id, renderer, content, sourceHash, revision, deletedAt
          FROM markdown
          WHERE id > ? AND sourceHash IS NULL
          ORDER BY id
          LIMIT ?`,
        args: [afterId, limit],
      })
      return result.rows.map(row => sourceRow(row as Record<string, unknown>))
    },
    readAuditBatch: async (afterId, limit) => {
      const result = await client.execute({
        sql: `SELECT id, renderer, content, sourceHash, revision, deletedAt
          FROM markdown
          WHERE id > ?
          ORDER BY id
          LIMIT ?`,
        args: [afterId, limit],
      })
      return result.rows.map(row => sourceRow(row as Record<string, unknown>))
    },
    compareAndSetSourceHash: async (input) => {
      const result = await client.execute({
        sql: `UPDATE markdown
          SET sourceHash = ?
          WHERE id = ? AND revision = ? AND sourceHash IS NULL`,
        args: [input.sourceHash, input.id, input.baseRevision],
      })
      return result.rowsAffected === 1
    },
    readById: async (id) => {
      const result = await client.execute({
        sql: `SELECT id, renderer, content, sourceHash, revision, deletedAt
          FROM markdown
          WHERE id = ?
          LIMIT 1`,
        args: [id],
      })
      return result.rows[0] ? sourceRow(result.rows[0] as Record<string, unknown>) : null
    },
    readTemplateCatalogRow: async () => {
      const result = await client.execute({
        sql: `SELECT schemaVersion, revision, payload
          FROM creation_template_catalog
          WHERE key = 'koala:creation-templates'
          LIMIT 1`,
        args: [],
      })
      const row = result.rows[0]
      return row
        ? {
            schemaVersion: Number(row.schemaVersion),
            revision: Number(row.revision),
            payload: String(row.payload),
          }
        : null
    },
    compareAndSetTemplateCatalog: async (input) => {
      const result = await client.execute({
        sql: `UPDATE creation_template_catalog
          SET schemaVersion = 2, revision = ?, payload = ?, updatedAt = unixepoch()
          WHERE key = 'koala:creation-templates'
            AND schemaVersion = 1
            AND revision = ?`,
        args: [input.baseRevision + 1, input.payload, input.baseRevision],
      })
      return result.rowsAffected === 1
    },
    close: () => client.close(),
  }
}

export function createSQLiteSourceHashOperatorStore(databasePath: string): SourceHashOperatorStore {
  const path = resolve(databasePath)
  return createSQLiteStore(createClient({ url: `file:${path}` }))
}

async function executeD1(target: D1OperatorTarget, statement: string): Promise<Record<string, unknown>[]> {
  const arguments_ = [
    'exec',
    'wrangler',
    'd1',
    'execute',
    target.database,
    target.mode === 'local' ? '--local' : '--remote',
    '--json',
    '--command',
    statement,
  ]
  if (target.mode === 'local')
    arguments_.push('--persist-to', target.persistTo!)
  else
    arguments_.push('--yes')

  const { stdout } = await run('pnpm', arguments_, {
    cwd: process.cwd(),
    maxBuffer: 10 * 1024 * 1024,
  })
  const result = JSON.parse(stdout) as Array<{
    success?: unknown
    results?: unknown
  }>
  if (result.length !== 1 || result[0]?.success !== true || !Array.isArray(result[0].results))
    throw new Error(`Wrangler D1 maintenance command returned an invalid result for ${target.database}`)
  return result[0].results as Record<string, unknown>[]
}

function templatePayloadExpression(payload: string): string {
  return `CAST(X'${Buffer.from(payload, 'utf8').toString('hex')}' AS TEXT)`
}

export function createD1SourceHashOperatorStore(
  target: D1OperatorTarget,
  execute: D1StatementExecutor = executeD1,
): SourceHashOperatorStore {
  return {
    readMissingBatch: async (afterId, limit) => (await execute(target, `
      SELECT id, renderer, content, sourceHash, revision, deletedAt,
        sourceHash IS NULL AS sourceHashIsNull,
        deletedAt IS NULL AS deletedAtIsNull
      FROM markdown
      WHERE id > ${afterId} AND sourceHash IS NULL
      ORDER BY id
      LIMIT ${limit}
    `)).map(sourceRow),
    readAuditBatch: async (afterId, limit) => (await execute(target, `
      SELECT id, renderer, content, sourceHash, revision, deletedAt,
        sourceHash IS NULL AS sourceHashIsNull,
        deletedAt IS NULL AS deletedAtIsNull
      FROM markdown
      WHERE id > ${afterId}
      ORDER BY id
      LIMIT ${limit}
    `)).map(sourceRow),
    compareAndSetSourceHash: async input => (await execute(target, `
      UPDATE markdown
      SET sourceHash = '${input.sourceHash}'
      WHERE id = ${input.id}
        AND revision = ${input.baseRevision}
        AND sourceHash IS NULL
      RETURNING id
    `)).length === 1,
    readById: async (id) => {
      const [row] = await execute(target, `
        SELECT id, renderer, content, sourceHash, revision, deletedAt,
          sourceHash IS NULL AS sourceHashIsNull,
          deletedAt IS NULL AS deletedAtIsNull
        FROM markdown
        WHERE id = ${id}
        LIMIT 1
      `)
      return row ? sourceRow(row) : null
    },
    readTemplateCatalogRow: async () => {
      const [row] = await execute(target, `
        SELECT schemaVersion, revision, payload
        FROM creation_template_catalog
        WHERE key = 'koala:creation-templates'
        LIMIT 1
      `)
      return row
        ? {
            schemaVersion: Number(row.schemaVersion),
            revision: Number(row.revision),
            payload: String(row.payload),
          }
        : null
    },
    compareAndSetTemplateCatalog: async input => (await execute(target, `
      UPDATE creation_template_catalog
      SET schemaVersion = 2,
        revision = ${input.baseRevision + 1},
        payload = ${templatePayloadExpression(input.payload)},
        updatedAt = unixepoch()
      WHERE key = 'koala:creation-templates'
        AND schemaVersion = 1
        AND revision = ${input.baseRevision}
      RETURNING revision
    `)).length === 1,
    close: () => undefined,
  }
}
