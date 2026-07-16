import {
  ensureTemplateCatalogInitialized,
  readTemplateCatalog,
  replaceTemplateCatalog,
} from '@/db/template-catalog'
import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'

import catalogMigration from '../../migrations/0001_creation_template_catalog.sql?raw'

describe('template Catalog D1 contract', () => {
  beforeEach(async () => {
    await env.DB.exec('DROP TABLE IF EXISTS creation_template_catalog')
    await env.DB.exec(catalogMigration.replaceAll('--> statement-breakpoint', ''))
  })

  it('keeps migration state absent until initialization writes the preset', async () => {
    expect(await readTemplateCatalog(env)).toEqual({ status: 'absent' })
    expect(await ensureTemplateCatalogInitialized(env)).toMatchObject({
      schemaVersion: 1,
      revision: 1,
      templates: [{ id: 'memo-default', prefix: '/memo/' }],
    })
  })

  it('preserves an explicitly empty Catalog across initialization', async () => {
    const initial = await ensureTemplateCatalogInitialized(env)
    expect(await replaceTemplateCatalog(env, initial.revision, [])).toEqual({
      status: 'saved',
      catalog: { schemaVersion: 1, revision: 2, templates: [] },
    })
    expect(await ensureTemplateCatalogInitialized(env)).toEqual({
      schemaVersion: 1,
      revision: 2,
      templates: [],
    })
  })

  it('returns a conflict for a stale D1 replacement', async () => {
    const initial = await ensureTemplateCatalogInitialized(env)
    await replaceTemplateCatalog(env, initial.revision, [])

    expect(await replaceTemplateCatalog(env, initial.revision, initial.templates)).toEqual({
      status: 'conflict',
      currentRevision: 2,
    })
  })
})
