import { connectDB } from '@/db'
import { saveFile } from '@/db/markdown'
import { markdown } from '@/db/schema'
import {
  auditStoredSourceHashes,
  backfillSourceHashBatch,
  createSourceHashMaintenanceStore,
  runSourceHashBackfillBatch,
} from '@/db/source-hash-maintenance'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const PRE_0004_MISSING_SOURCE_HASH = null as unknown as string

interface SourceHashMaintenanceHarness {
  name: string
  env: Env
  prepare: () => Promise<void>
  cleanup?: () => Promise<void>
}

function useMaintenanceHarness(harness: SourceHashMaintenanceHarness) {
  beforeEach(harness.prepare)
  afterEach(async () => harness.cleanup?.())
}

export function defineSourceHashMaintenanceContract(harness: SourceHashMaintenanceHarness): void {
  describe(`Source Hash maintenance ${harness.name}`, () => {
    useMaintenanceHarness(harness)

    it('backfills active and recycled Files in resumable stable-ID batches', async () => {
      await connectDB(harness.env).insert(markdown).values([
        {
          id: 9,
          source: 20,
          path: '/app/counter',
          title: 'counter',
          renderer: 'svelte',
          content: '<script>let count = 0</script>\n<button>{count}</button>',
          sourceHash: PRE_0004_MISSING_SOURCE_HASH,
        },
        {
          id: 2,
          source: 10,
          path: '/post/alpha',
          title: 'alpha',
          renderer: 'markdown',
          content: 'alpha',
          sourceHash: PRE_0004_MISSING_SOURCE_HASH,
          revision: 9,
          updatedAt: new Date(1_760_000_000_000),
        },
        {
          id: 5,
          source: 30,
          path: '/memo/recycled',
          title: 'recycled',
          renderer: 'markdown',
          content: '',
          sourceHash: PRE_0004_MISSING_SOURCE_HASH,
          deletedAt: new Date(1_770_000_000_000),
        },
      ])

      const first = await backfillSourceHashBatch(harness.env, { afterId: 0, limit: 2 })
      expect(first).toMatchObject({
        schemaVersion: 1,
        afterId: 0,
        nextAfterId: 5,
        done: false,
        counts: { processed: 2, updated: 2, skipped: 0, invalid: 0, retried: 0 },
      })
      expect(first.outcomes.map(outcome => [outcome.id, outcome.status])).toEqual([
        [2, 'updated'],
        [5, 'updated'],
      ])
      const [firstBackfilled] = await connectDB(harness.env).select().from(markdown).where(eq(markdown.id, 2))
      expect(firstBackfilled).toMatchObject({
        revision: 9,
        updatedAt: new Date(1_760_000_000_000),
      })
      await expect(auditStoredSourceHashes(harness.env, 2)).resolves.toMatchObject({
        status: 'blocked',
        summary: { total: 3, active: 2, recycled: 1, current: 2, missing: 1 },
      })

      const second = await backfillSourceHashBatch(harness.env, { afterId: first.nextAfterId, limit: 2 })
      expect(second).toMatchObject({
        nextAfterId: 9,
        done: true,
        counts: { processed: 1, updated: 1, skipped: 0, invalid: 0, retried: 0 },
      })
      await expect(auditStoredSourceHashes(harness.env, 2)).resolves.toMatchObject({
        status: 'ready',
        summary: { total: 3, active: 2, recycled: 1, current: 3, missing: 0, mismatched: 0, invalid: 0 },
      })

      await expect(backfillSourceHashBatch(harness.env, { afterId: 0, limit: 2 })).resolves.toMatchObject({
        nextAfterId: 0,
        done: true,
        counts: { processed: 0, updated: 0, skipped: 0, invalid: 0, retried: 0 },
      })
    })

    it('does not overwrite a concurrent Source Save after reading its old revision', async () => {
      await connectDB(harness.env).insert(markdown).values({
        id: 11,
        source: 20,
        path: '/app/live',
        title: 'live',
        renderer: 'markdown',
        content: 'old Source',
        sourceHash: PRE_0004_MISSING_SOURCE_HASH,
      })
      const store = createSourceHashMaintenanceStore(harness.env)
      let sourceSaved = false
      const racingStore = {
        ...store,
        compareAndSetSourceHash: async (input: Parameters<typeof store.compareAndSetSourceHash>[0]) => {
          if (!sourceSaved) {
            sourceSaved = true
            await expect(saveFile(harness.env, {
              id: 11,
              path: '/app/live',
              renderer: 'svelte',
              content: '<script>let count = 0</script>\n<button>{count}</button>',
              private: false,
              baseRevision: 1,
            })).resolves.toMatchObject({ status: 'saved', file: { revision: 2 } })
          }
          return store.compareAndSetSourceHash(input)
        },
      }

      const result = await runSourceHashBackfillBatch(racingStore, { afterId: 0, limit: 10 })

      expect(result).toMatchObject({
        counts: { processed: 1, updated: 0, skipped: 1, invalid: 0, retried: 0 },
        outcomes: [{ id: 11, observedRevision: 1, status: 'skipped', attempts: 1, reason: 'already_current' }],
      })
      const [stored] = await connectDB(harness.env).select().from(markdown).where(eq(markdown.id, 11))
      expect(stored).toMatchObject({
        renderer: 'svelte',
        content: '<script>let count = 0</script>\n<button>{count}</button>',
        sourceHash: 'f013faecf0cd5ceeeb7b8f913aafb6243e639f21a9b07d0e8c5d8f76da9dbf6d',
        revision: 2,
      })
    })

    it('retries a still-missing Hash from the fresh revision once', async () => {
      await connectDB(harness.env).insert(markdown).values({
        id: 12,
        source: 10,
        path: '/post/metadata-race',
        title: 'metadata-race',
        renderer: 'markdown',
        content: '',
        sourceHash: PRE_0004_MISSING_SOURCE_HASH,
      })
      const store = createSourceHashMaintenanceStore(harness.env)
      let revisionChanged = false
      const racingStore = {
        ...store,
        compareAndSetSourceHash: async (input: Parameters<typeof store.compareAndSetSourceHash>[0]) => {
          if (!revisionChanged) {
            revisionChanged = true
            await connectDB(harness.env)
              .update(markdown)
              .set({ private: true, revision: 2 })
              .where(eq(markdown.id, 12))
          }
          return store.compareAndSetSourceHash(input)
        },
      }

      const result = await runSourceHashBackfillBatch(racingStore, { afterId: 0, limit: 10 })

      expect(result).toMatchObject({
        counts: { processed: 1, updated: 1, skipped: 0, invalid: 0, retried: 1 },
        outcomes: [{ id: 12, observedRevision: 1, status: 'updated', attempts: 2 }],
      })
      const [stored] = await connectDB(harness.env).select().from(markdown).where(eq(markdown.id, 12))
      expect(stored).toMatchObject({
        private: true,
        revision: 2,
        sourceHash: 'c4a3e04fa78d47ace9853e81fcedcf84172449d37a72852120d3a41b14a6c1f5',
      })
    })

    it('reports invalid stored Renderer values without writing a placeholder Hash', async () => {
      await connectDB(harness.env).insert(markdown).values({
        id: 13,
        source: 20,
        path: '/invalid-renderer',
        title: 'invalid-renderer',
        renderer: 'invalid' as 'markdown',
        content: 'Source',
        sourceHash: PRE_0004_MISSING_SOURCE_HASH,
      })

      await expect(backfillSourceHashBatch(harness.env, { afterId: 0, limit: 10 })).resolves.toMatchObject({
        counts: { processed: 1, updated: 0, skipped: 0, invalid: 1, retried: 0 },
        outcomes: [{ id: 13, status: 'invalid', reason: 'invalid_renderer' }],
      })
      await expect(auditStoredSourceHashes(harness.env)).resolves.toMatchObject({
        status: 'blocked',
        summary: { total: 1, current: 0, missing: 0, mismatched: 0, invalid: 1 },
        issues: [{ id: 13, code: 'invalid_renderer' }],
      })
    })

    it('rejects unbounded or invalid batch cursors before reading storage', async () => {
      await expect(backfillSourceHashBatch(harness.env, { afterId: -1, limit: 10 }))
        .rejects
        .toThrow('afterId must be a non-negative integer')
      await expect(backfillSourceHashBatch(harness.env, { afterId: 0, limit: 0 }))
        .rejects
        .toThrow('limit must be between 1 and 500')
      await expect(backfillSourceHashBatch(harness.env, { afterId: 0, limit: 501 }))
        .rejects
        .toThrow('limit must be between 1 and 500')
      await expect(auditStoredSourceHashes(harness.env, 501))
        .rejects
        .toThrow('limit must be between 1 and 500')
    })
  })
}
