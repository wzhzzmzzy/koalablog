import { createFile } from '@/db/file-create'
import { ensureTemplateCatalogInitialized, replaceTemplateCatalog } from '@/db/template-catalog'
import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import legacySchema from '../../migrations/0000_init.sql?raw'
import catalogMigration from '../../migrations/0001_creation_template_catalog.sql?raw'
import sourceMigration from '../../migrations/0002_file_source_schema.sql?raw'

function statements(sql: string) {
  return sql.split('--> statement-breakpoint').map(statement => statement.trim()).filter(Boolean)
}

async function runStatements(sql: string) {
  for (const statement of statements(sql))
    await env.DB.prepare(statement).run()
}

describe('Gate 1D D1 File creation', () => {
  beforeEach(async () => {
    await env.DB.prepare('DROP TABLE IF EXISTS markdown').run()
    await env.DB.prepare('DROP TABLE IF EXISTS creation_template_catalog').run()
    for (const statement of statements(legacySchema).filter(statement => statement.includes('markdown')))
      await env.DB.prepare(statement).run()
    await runStatements(sourceMigration)
    await runStatements(catalogMigration)
  })

  it('uses the D1 active-Path constraint to resolve concurrent Blank Creation', async () => {
    const catalog = await ensureTemplateCatalogInitialized(env)
    await replaceTemplateCatalog(env, catalog.revision, [])

    const results = await Promise.all([
      createFile(env, { targetPrefix: '/wiki/' }),
      createFile(env, { targetPrefix: '/wiki/' }),
    ])

    expect(results.map(result => result.status === 'created' ? result.file.path : result.status).sort())
      .toEqual(['/wiki/unnamed', '/wiki/unnamed-1'])
  })
})
