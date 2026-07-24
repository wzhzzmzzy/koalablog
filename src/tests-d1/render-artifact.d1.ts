import { defineRenderArtifactContract } from '@/tests/shared/render-artifact-contract'
import { env } from 'cloudflare:test'
import legacySchema from '../../migrations/0000_init.sql?raw'
import sourceMigration from '../../migrations/0002_file_source_schema.sql?raw'
import rendererMigration from '../../migrations/0003_file_renderer_source_hash.sql?raw'
import sourceHashMigration from '../../migrations/0004_require_source_hash.sql?raw'
import renderArtifactMigration from '../../migrations/0005_render_artifact.sql?raw'

function statements(migration: string) {
  return migration.split('--> statement-breakpoint').map(statement => statement.trim()).filter(Boolean)
}

async function runStatements(migration: string) {
  for (const statement of statements(migration))
    await env.DB.prepare(statement).run()
}

defineRenderArtifactContract({
  name: 'D1',
  env,
  prepare: async () => {
    await env.DB.prepare('DROP TABLE IF EXISTS markdown_render').run()
    await env.DB.prepare('DROP TABLE IF EXISTS markdown').run()
    for (const statement of statements(legacySchema).filter(statement => statement.includes('markdown')))
      await env.DB.prepare(statement).run()
    await runStatements(sourceMigration)
    await runStatements(rendererMigration)
    await runStatements(sourceHashMigration)
    await runStatements(renderArtifactMigration)
  },
})
