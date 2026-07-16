import { randomUUID } from 'node:crypto'
import { readFile, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  ensureTemplateCatalogInitialized,
  readTemplateCatalog,
  replaceTemplateCatalog,
} from '@/db/template-catalog'
import { createClient } from '@libsql/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('template Catalog storage', () => {
  const testEnv = {} as Env
  let databasePath: string

  beforeEach(async () => {
    databasePath = join(tmpdir(), `koalablog-template-catalog-${randomUUID()}.db`)
    vi.stubEnv('SQLITE_URL', `file:${databasePath}`)

    const client = createClient({ url: `file:${databasePath}` })
    await client.executeMultiple(`
      CREATE TABLE creation_template_catalog (
        key text PRIMARY KEY NOT NULL,
        schemaVersion integer NOT NULL,
        revision integer NOT NULL,
        payload text NOT NULL,
        createdAt integer DEFAULT (unixepoch()) NOT NULL,
        updatedAt integer DEFAULT (unixepoch()) NOT NULL
      );
    `)
    client.close()
  })

  afterEach(async () => {
    vi.unstubAllEnvs()
    await unlink(databasePath).catch(() => undefined)
  })

  it('distinguishes an absent Catalog from a stored Catalog', async () => {
    expect(await readTemplateCatalog(testEnv)).toEqual({ status: 'absent' })
  })

  it('seeds the ordinary memo preset when an existing site applies the Catalog migration', async () => {
    const client = createClient({ url: `file:${databasePath}` })
    await client.execute('DROP TABLE creation_template_catalog')
    const migration = await readFile('migrations/0001_creation_template_catalog.sql', 'utf8')
    await client.executeMultiple(migration.replaceAll('--> statement-breakpoint', ''))
    client.close()

    expect(await readTemplateCatalog(testEnv)).toMatchObject({
      status: 'ready',
      catalog: {
        schemaVersion: 1,
        revision: 1,
        templates: [{ id: 'memo-default', prefix: '/memo/' }],
      },
    })
  })

  it('writes the memo preset once and never restores it over an empty Catalog', async () => {
    const initialized = await ensureTemplateCatalogInitialized(testEnv)
    expect(initialized).toMatchObject({
      schemaVersion: 1,
      revision: 1,
      templates: [{
        id: 'memo-default',
        prefix: '/memo/',
        pathPattern: '{{targetPrefix}}/{{title}}',
      }],
    })

    const saved = await replaceTemplateCatalog(testEnv, initialized.revision, [])
    expect(saved).toEqual({
      status: 'saved',
      catalog: { schemaVersion: 1, revision: 2, templates: [] },
    })

    expect(await ensureTemplateCatalogInitialized(testEnv)).toEqual({
      schemaVersion: 1,
      revision: 2,
      templates: [],
    })
  })

  it('rejects a stale catalog replacement without changing stored data', async () => {
    const initialized = await ensureTemplateCatalogInitialized(testEnv)
    const firstSave = await replaceTemplateCatalog(testEnv, initialized.revision, [])
    expect(firstSave.status).toBe('saved')

    expect(await replaceTemplateCatalog(testEnv, initialized.revision, initialized.templates)).toEqual({
      status: 'conflict',
      currentRevision: 2,
    })
    expect(await readTemplateCatalog(testEnv)).toEqual({
      status: 'ready',
      catalog: { schemaVersion: 1, revision: 2, templates: [] },
    })
  })

  it('rejects duplicate normalized Prefixes before writing', async () => {
    const initialized = await ensureTemplateCatalogInitialized(testEnv)
    await expect(replaceTemplateCatalog(testEnv, initialized.revision, [
      initialized.templates[0],
      { ...initialized.templates[0], id: 'duplicate', prefix: '/memo' },
    ])).rejects.toMatchObject({ code: 'invalid_catalog' })

    expect((await readTemplateCatalog(testEnv))).toEqual({
      status: 'ready',
      catalog: initialized,
    })
  })

  it('rejects duplicate Template IDs before writing', async () => {
    const initialized = await ensureTemplateCatalogInitialized(testEnv)
    await expect(replaceTemplateCatalog(testEnv, initialized.revision, [
      initialized.templates[0],
      { ...initialized.templates[0], prefix: '/post/' },
    ])).rejects.toMatchObject({ code: 'invalid_catalog' })
  })
})
