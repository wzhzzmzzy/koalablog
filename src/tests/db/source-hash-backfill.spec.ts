import { randomUUID } from 'node:crypto'
import { unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { connectDB } from '@/db'
import { defineSourceHashMaintenanceContract } from '@/tests/shared/source-hash-maintenance-contract'
import { sql } from 'drizzle-orm'
import { vi } from 'vitest'

import legacySchema from '../../../migrations/0000_init.sql?raw'
import fileSourceMigration from '../../../migrations/0002_file_source_schema.sql?raw'
import sourceHashMigration from '../../../migrations/0003_file_renderer_source_hash.sql?raw'

const testEnv = {} as Env
let databasePath = ''

function statements(migration: string): string[] {
  return migration.split('--> statement-breakpoint').map(statement => statement.trim()).filter(Boolean)
}

async function runStatements(migration: string): Promise<void> {
  for (const statement of statements(migration))
    await connectDB(testEnv).run(sql.raw(statement))
}

defineSourceHashMaintenanceContract({
  name: 'SQLite',
  env: testEnv,
  prepare: async () => {
    databasePath = join(tmpdir(), `koalablog-source-hash-backfill-${randomUUID()}.db`)
    vi.stubEnv('SQLITE_URL', `file:${databasePath}`)
    await runStatements(legacySchema)
    await runStatements(fileSourceMigration)
    await runStatements(sourceHashMigration)
  },
  cleanup: async () => {
    vi.unstubAllEnvs()
    await unlink(databasePath).catch(() => undefined)
  },
})
