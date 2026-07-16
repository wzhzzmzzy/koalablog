import type { CreationTemplateV1 } from '@/lib/files/types'
import { connectDB } from '@/db'
import { creationTemplateCatalog } from '@/db/schema'
import {
  ensureTemplateCatalogInitialized,
  readTemplateCatalog,
  replaceTemplateCatalog,
} from '@/db/template-catalog'
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

function defineCatalogLifecycleContract(harness: TemplateCatalogContractHarness) {
  describe(`template Catalog ${harness.name} lifecycle`, () => {
    useCatalogHarness(harness)

    it('keeps migration state absent until initialization writes the preset', async () => {
      expect(await readTemplateCatalog(harness.env)).toEqual({ status: 'absent' })
      expect(await ensureTemplateCatalogInitialized(harness.env)).toMatchObject({
        schemaVersion: 1,
        revision: 1,
        templates: [{ id: 'memo-default', prefix: '/memo/' }],
      })
    })

    it('writes the memo preset once and never restores it over an empty Catalog', async () => {
      const initialized = await ensureTemplateCatalogInitialized(harness.env)
      expect(initialized).toMatchObject({
        schemaVersion: 1,
        revision: 1,
        templates: [{
          id: 'memo-default',
          prefix: '/memo/',
          pathPattern: '{{targetPrefix}}/{{title}}',
        }],
      })

      const saved = await replaceTemplateCatalog(harness.env, initialized.revision, [])
      expect(saved).toEqual({
        status: 'saved',
        catalog: { schemaVersion: 1, revision: 2, templates: [] },
      })
      expect(await ensureTemplateCatalogInitialized(harness.env)).toEqual({
        schemaVersion: 1,
        revision: 2,
        templates: [],
      })
    })

    it('rejects a stale replacement without changing stored data', async () => {
      const initialized = await ensureTemplateCatalogInitialized(harness.env)
      expect((await replaceTemplateCatalog(harness.env, initialized.revision, [])).status).toBe('saved')

      expect(await replaceTemplateCatalog(harness.env, initialized.revision, initialized.templates)).toEqual({
        status: 'conflict',
        currentRevision: 2,
      })
      expect(await readTemplateCatalog(harness.env)).toEqual({
        status: 'ready',
        catalog: { schemaVersion: 1, revision: 2, templates: [] },
      })
    })

    it('preserves the Catalog across an unrelated Settings update', async () => {
      const initialized = await ensureTemplateCatalogInitialized(harness.env)

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
      const initialized = await ensureTemplateCatalogInitialized(harness.env)
      const templates: CreationTemplateV1[] = [
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
      const initialized = await ensureTemplateCatalogInitialized(harness.env)
      const templates: CreationTemplateV1[] = [
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
      const initialized = await ensureTemplateCatalogInitialized(harness.env)
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
  defineCatalogValidationContract(harness)
}
