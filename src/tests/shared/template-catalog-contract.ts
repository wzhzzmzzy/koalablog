import type { CreationTemplateV2, TemplateCatalogV2 } from '@/lib/files/types'
import { connectDB } from '@/db'
import { creationTemplateCatalog } from '@/db/schema'
import {
  ensureTemplateCatalogInitialized,
  readTemplateCatalog,
  replaceTemplateCatalog,
  upgradeStoredTemplateCatalog,
} from '@/db/template-catalog'
import { DEFAULT_MEMO_TEMPLATE_V1 } from '@/lib/files/template'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

interface TemplateCatalogContractHarness {
  name: string
  env: Env
  prepare: () => Promise<void>
  cleanup?: () => Promise<void>
  updateUnrelatedSettings: () => Promise<void>
}

function useCatalogHarness(harness: TemplateCatalogContractHarness) {
  beforeEach(harness.prepare)
  afterEach(async () => harness.cleanup?.())
}

async function initializeCatalogV2(env: Env): Promise<TemplateCatalogV2> {
  const catalog = await ensureTemplateCatalogInitialized(env)
  if (catalog.schemaVersion !== 2)
    throw new Error('Expected fresh Template Catalog initialization to use schema v2')
  return catalog
}

function defineCatalogLifecycleContract(harness: TemplateCatalogContractHarness) {
  describe(`template Catalog ${harness.name} lifecycle`, () => {
    useCatalogHarness(harness)

    it('keeps migration state absent until initialization writes the preset', async () => {
      expect(await readTemplateCatalog(harness.env)).toEqual({ status: 'absent' })
      expect(await ensureTemplateCatalogInitialized(harness.env)).toMatchObject({
        schemaVersion: 2,
        revision: 1,
        templates: [{ id: 'memo-default', prefix: '/memo/', renderer: 'markdown' }],
      })
    })

    it('upgrades a stored v1 Catalog only at its matching revision', async () => {
      await connectDB(harness.env).insert(creationTemplateCatalog).values({
        key: 'koala:creation-templates',
        schemaVersion: 1,
        revision: 7,
        payload: JSON.stringify([DEFAULT_MEMO_TEMPLATE_V1]),
      })

      expect(await readTemplateCatalog(harness.env)).toEqual({
        status: 'ready',
        catalog: {
          schemaVersion: 1,
          revision: 7,
          templates: [DEFAULT_MEMO_TEMPLATE_V1],
        },
      })
      await expect(upgradeStoredTemplateCatalog(harness.env, 7)).resolves.toEqual({
        status: 'upgraded',
        catalog: {
          schemaVersion: 2,
          revision: 8,
          templates: [{ ...DEFAULT_MEMO_TEMPLATE_V1, renderer: 'markdown' }],
        },
      })

      const [stored] = await connectDB(harness.env).select().from(creationTemplateCatalog)
      expect(stored).toMatchObject({ schemaVersion: 2, revision: 8 })
      expect(JSON.parse(stored.payload)).toEqual([{ ...DEFAULT_MEMO_TEMPLATE_V1, renderer: 'markdown' }])
    })

    it('keeps an empty v1 Catalog empty when upgrading it', async () => {
      await connectDB(harness.env).insert(creationTemplateCatalog).values({
        key: 'koala:creation-templates',
        schemaVersion: 1,
        revision: 2,
        payload: '[]',
      })

      await expect(upgradeStoredTemplateCatalog(harness.env, 2)).resolves.toEqual({
        status: 'upgraded',
        catalog: { schemaVersion: 2, revision: 3, templates: [] },
      })
      await expect(readTemplateCatalog(harness.env)).resolves.toEqual({
        status: 'ready',
        catalog: { schemaVersion: 2, revision: 3, templates: [] },
      })
    })

    it('does not overwrite a newer v1 Catalog revision', async () => {
      const concurrentTemplate = { ...DEFAULT_MEMO_TEMPLATE_V1, content: 'concurrent edit' }
      await connectDB(harness.env).insert(creationTemplateCatalog).values({
        key: 'koala:creation-templates',
        schemaVersion: 1,
        revision: 5,
        payload: JSON.stringify([concurrentTemplate]),
      })

      await expect(upgradeStoredTemplateCatalog(harness.env, 4)).resolves.toEqual({
        status: 'conflict',
        currentRevision: 5,
      })
      await expect(readTemplateCatalog(harness.env)).resolves.toEqual({
        status: 'ready',
        catalog: { schemaVersion: 1, revision: 5, templates: [concurrentTemplate] },
      })
    })

    it('treats a stored v2 Catalog as already current without changing its revision', async () => {
      const initialized = await initializeCatalogV2(harness.env)

      await expect(upgradeStoredTemplateCatalog(harness.env, initialized.revision)).resolves.toEqual({
        status: 'already_current',
        catalog: initialized,
      })
      await expect(readTemplateCatalog(harness.env)).resolves.toEqual({
        status: 'ready',
        catalog: initialized,
      })
    })

    it('reports an absent Catalog without initializing it', async () => {
      await expect(upgradeStoredTemplateCatalog(harness.env, 1)).resolves.toEqual({ status: 'absent' })
      await expect(readTemplateCatalog(harness.env)).resolves.toEqual({ status: 'absent' })
    })
  })
}

function defineCatalogReplacementContract(harness: TemplateCatalogContractHarness) {
  describe(`template Catalog ${harness.name} replacement`, () => {
    useCatalogHarness(harness)

    it('writes the memo preset once and never restores it over an empty Catalog', async () => {
      const initialized = await initializeCatalogV2(harness.env)
      expect(initialized).toMatchObject({
        schemaVersion: 2,
        revision: 1,
        templates: [{
          id: 'memo-default',
          prefix: '/memo/',
          renderer: 'markdown',
          pathPattern: '{{targetPrefix}}/{{title}}',
        }],
      })

      const saved = await replaceTemplateCatalog(harness.env, initialized.revision, [])
      expect(saved).toEqual({
        status: 'saved',
        catalog: { schemaVersion: 2, revision: 2, templates: [] },
      })
      expect(await ensureTemplateCatalogInitialized(harness.env)).toEqual({
        schemaVersion: 2,
        revision: 2,
        templates: [],
      })
    })

    it('rejects a stale replacement without changing stored data', async () => {
      const initialized = await initializeCatalogV2(harness.env)
      expect((await replaceTemplateCatalog(harness.env, initialized.revision, [])).status).toBe('saved')

      expect(await replaceTemplateCatalog(harness.env, initialized.revision, initialized.templates)).toEqual({
        status: 'conflict',
        currentRevision: 2,
      })
      expect(await readTemplateCatalog(harness.env)).toEqual({
        status: 'ready',
        catalog: { schemaVersion: 2, revision: 2, templates: [] },
      })
    })

    it('preserves the Catalog across an unrelated Settings update', async () => {
      const initialized = await initializeCatalogV2(harness.env)

      await harness.updateUnrelatedSettings()

      expect(await readTemplateCatalog(harness.env)).toEqual({
        status: 'ready',
        catalog: initialized,
      })
    })
  })
}

function defineCatalogValidationContract(harness: TemplateCatalogContractHarness) {
  describe(`template Catalog ${harness.name} validation`, () => {
    useCatalogHarness(harness)

    it('rejects duplicate normalized Prefixes before writing', async () => {
      const initialized = await initializeCatalogV2(harness.env)
      const templates: CreationTemplateV2[] = [
        initialized.templates[0],
        { ...initialized.templates[0], id: 'duplicate', prefix: '/memo' },
      ]

      await expect(replaceTemplateCatalog(harness.env, initialized.revision, templates))
        .rejects
        .toMatchObject({ code: 'invalid_catalog' })
      expect(await readTemplateCatalog(harness.env)).toEqual({
        status: 'ready',
        catalog: initialized,
      })
    })

    it('rejects duplicate Template IDs before writing', async () => {
      const initialized = await initializeCatalogV2(harness.env)
      const templates: CreationTemplateV2[] = [
        initialized.templates[0],
        { ...initialized.templates[0], prefix: '/post/' },
      ]

      await expect(replaceTemplateCatalog(harness.env, initialized.revision, templates))
        .rejects
        .toMatchObject({ code: 'invalid_catalog' })
    })

    it('surfaces malformed stored records instead of synthesizing an empty Catalog', async () => {
      await ensureTemplateCatalogInitialized(harness.env)
      await connectDB(harness.env).update(creationTemplateCatalog).set({ payload: '{not-json' })

      await expect(readTemplateCatalog(harness.env)).rejects.toMatchObject({ code: 'invalid_storage' })
    })

    it('persists large Content without coupling it to global Settings', async () => {
      const initialized = await initializeCatalogV2(harness.env)
      const templates = [{ ...initialized.templates[0], content: 'x'.repeat(100_000) }]

      await expect(replaceTemplateCatalog(harness.env, initialized.revision, templates)).resolves.toMatchObject({
        status: 'saved',
        catalog: { revision: 2, templates },
      })
      await expect(readTemplateCatalog(harness.env)).resolves.toMatchObject({
        status: 'ready',
        catalog: { revision: 2, templates },
      })
    })
  })
}

export function defineTemplateCatalogContract(harness: TemplateCatalogContractHarness): void {
  defineCatalogLifecycleContract(harness)
  defineCatalogReplacementContract(harness)
  defineCatalogValidationContract(harness)
}
