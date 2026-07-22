import { createFile } from '@/db/file-create'
import { ensureTemplateCatalogInitialized, replaceTemplateCatalog } from '@/db/template-catalog'
import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import legacySchema from '../../migrations/0000_init.sql?raw'
import catalogMigration from '../../migrations/0001_creation_template_catalog.sql?raw'
import sourceMigration from '../../migrations/0002_file_source_schema.sql?raw'
import sourceHashMigration from '../../migrations/0003_file_renderer_source_hash.sql?raw'

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
    await runStatements(sourceHashMigration)
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
    expect(results).toEqual(expect.arrayContaining([
      expect.objectContaining({
        status: 'created',
        file: expect.objectContaining({
          renderer: 'markdown',
          sourceHash: 'c4a3e04fa78d47ace9853e81fcedcf84172449d37a72852120d3a41b14a6c1f5',
        }),
      }),
    ]))
  })

  it('persists a Svelte Template Renderer and Source Hash on D1', async () => {
    const content = '<script>let count = 0</script>\n<button>{count}</button>'
    const catalog = await ensureTemplateCatalogInitialized(env)
    await replaceTemplateCatalog(env, catalog.revision, [{
      id: 'svelte',
      prefix: '/app/',
      titlePattern: 'welcome',
      pathPattern: '{{targetPrefix}}/{{title}}',
      renderer: 'svelte',
      content,
    }])

    const result = await createFile(env, { targetPrefix: '/app/' })

    expect(result).toMatchObject({
      status: 'created',
      file: {
        path: '/app/welcome',
        renderer: 'svelte',
        content,
        sourceHash: 'f013faecf0cd5ceeeb7b8f913aafb6243e639f21a9b07d0e8c5d8f76da9dbf6d',
      },
    })
  })
})
