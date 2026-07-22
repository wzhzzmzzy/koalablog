import { defineSourceHashMaintenanceContract } from '@/tests/shared/source-hash-maintenance-contract'
import { env } from 'cloudflare:test'

import legacySchema from '../../migrations/0000_init.sql?raw'
import fileSourceMigration from '../../migrations/0002_file_source_schema.sql?raw'
import sourceHashMigration from '../../migrations/0003_file_renderer_source_hash.sql?raw'

function statements(migration: string): string[] {
  return migration.split('--> statement-breakpoint').map(statement => statement.trim()).filter(Boolean)
}

async function runStatements(migration: string): Promise<void> {
  for (const statement of statements(migration))
    await env.DB.prepare(statement).run()
}

defineSourceHashMaintenanceContract({
  name: 'D1',
  env,
  prepare: async () => {
    await env.DB.prepare('DROP TABLE IF EXISTS markdown').run()
    for (const statement of statements(legacySchema).filter(statement => statement.includes('markdown')))
      await env.DB.prepare(statement).run()
    await runStatements(fileSourceMigration)
    await runStatements(sourceHashMigration)
  },
})
