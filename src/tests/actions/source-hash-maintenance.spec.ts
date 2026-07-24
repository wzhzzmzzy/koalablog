import { audit, backfill, complete, start, status } from '@/actions/db/source-hash-maintenance'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  auditStoredSourceHashes: vi.fn(),
  authGuard: vi.fn(),
  backfillSourceHashBatch: vi.fn(),
  globalConfig: vi.fn(),
  hasSourceHashSchema: vi.fn(),
  readTemplateCatalog: vi.fn(),
  sourceHashBackfillMaintenance: vi.fn(),
  updateGlobalConfig: vi.fn(),
  upgradeStoredTemplateCatalog: vi.fn(),
}))

vi.mock('@/actions/utils/auth', () => ({ authGuard: mocks.authGuard }))
vi.mock('@/db/source-hash-maintenance', () => ({
  auditStoredSourceHashes: mocks.auditStoredSourceHashes,
  backfillSourceHashBatch: mocks.backfillSourceHashBatch,
  hasSourceHashSchema: mocks.hasSourceHashSchema,
}))
vi.mock('@/db/template-catalog', () => ({
  readTemplateCatalog: mocks.readTemplateCatalog,
  upgradeStoredTemplateCatalog: mocks.upgradeStoredTemplateCatalog,
}))
vi.mock('@/lib/kv', () => ({
  globalConfig: mocks.globalConfig,
  sourceHashBackfillMaintenance: mocks.sourceHashBackfillMaintenance,
  updateGlobalConfig: mocks.updateGlobalConfig,
}))

const env = { DB: 'db', KOALA_RELEASE_COMMIT: 'abcdef1' }
const context = { locals: { runtime: { env }, session: { role: 'admin' } } } as any
const inactive = { active: false }
const active = { active: true, applicationCommit: '1234567', startedAt: '2026-07-24T00:00:00.000Z' }

describe('Source Hash maintenance Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.globalConfig.mockResolvedValue({})
    mocks.hasSourceHashSchema.mockResolvedValue(true)
    mocks.sourceHashBackfillMaintenance.mockReturnValue(inactive)
  })

  it('starts maintenance and upgrades a legacy Template Catalog before backfilling', async () => {
    mocks.readTemplateCatalog.mockResolvedValue({ status: 'ready', catalog: { schemaVersion: 1, revision: 4 } })
    mocks.upgradeStoredTemplateCatalog.mockResolvedValue({ status: 'upgraded', catalog: { schemaVersion: 2, revision: 5 } })

    await expect(start.orThrow.call(context, { applicationCommit: 'abcdef1', operator: 'Amber' })).resolves.toMatchObject({
      maintenance: { active: true, applicationCommit: 'abcdef1', operator: 'Amber' },
      templateCatalog: { status: 'upgraded' },
    })
    expect(mocks.updateGlobalConfig).toHaveBeenCalledWith(env, {
      maintenance: {
        sourceHashBackfill: expect.objectContaining({ active: true, applicationCommit: 'abcdef1', operator: 'Amber' }),
      },
    })
    expect(mocks.upgradeStoredTemplateCatalog).toHaveBeenCalledWith(env, 4)
  })

  it('refuses to process a batch until maintenance is active', async () => {
    await expect(backfill.orThrow.call(context, { afterId: 0, batchSize: 100 })).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'Source Hash maintenance is not active',
    })
    expect(mocks.backfillSourceHashBatch).not.toHaveBeenCalled()
  })

  it('continues only from the persisted cursor and records cumulative batch progress', async () => {
    mocks.sourceHashBackfillMaintenance.mockReturnValue({
      ...active,
      progress: { afterId: 12, done: false, batches: 2, processed: 200, updated: 199, skipped: 1, invalid: 0, retried: 0 },
    })
    mocks.backfillSourceHashBatch.mockResolvedValue({
      nextAfterId: 18,
      done: false,
      counts: { processed: 100, updated: 100, skipped: 0, invalid: 0, retried: 1 },
    })

    await expect(backfill.orThrow.call(context, { afterId: 12, batchSize: 100 })).resolves.toMatchObject({
      batch: { nextAfterId: 18 },
      maintenance: {
        progress: { afterId: 18, batches: 3, processed: 300, updated: 299, retried: 1 },
      },
    })
    expect(mocks.updateGlobalConfig).toHaveBeenCalledWith(env, {
      maintenance: {
        sourceHashBackfill: expect.objectContaining({
          progress: expect.objectContaining({ afterId: 18, batches: 3 }),
        }),
      },
    })
  })

  it('rejects a stale browser cursor instead of restarting a recorded migration', async () => {
    mocks.sourceHashBackfillMaintenance.mockReturnValue({
      ...active,
      progress: { afterId: 12, done: false, batches: 2, processed: 200, updated: 199, skipped: 1, invalid: 0, retried: 0 },
    })

    await expect(backfill.orThrow.call(context, { afterId: 0, batchSize: 100 })).rejects.toMatchObject({
      code: 'CONFLICT',
      message: expect.stringContaining('source_hash_backfill_cursor_conflict'),
    })
    expect(mocks.backfillSourceHashBatch).not.toHaveBeenCalled()
  })

  it('rejects a commit that does not match the deployment marker', async () => {
    await expect(start.orThrow.call(context, { applicationCommit: '1234567', operator: 'Amber' })).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'The supplied commit does not match the deployed application commit',
    })
  })

  it('refuses to enter maintenance before migration 0003 creates the Source Hash schema', async () => {
    mocks.hasSourceHashSchema.mockResolvedValue(false)

    await expect(start.orThrow.call(context, { applicationCommit: 'abcdef1', operator: 'Amber' })).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'Source Hash schema is unavailable; apply migration 0003 before maintenance',
    })
  })

  it('audits Source Hashes and records the compact audit summary', async () => {
    const report = { status: 'blocked', summary: { total: 3, active: 2, recycled: 1, current: 1, missing: 1, mismatched: 1, invalid: 0 } }
    mocks.auditStoredSourceHashes.mockResolvedValue(report)

    await expect(audit.orThrow.call(context, { batchSize: 100 })).resolves.toEqual(report)
    expect(mocks.updateGlobalConfig).toHaveBeenCalledWith(env, {
      maintenance: {
        sourceHashBackfill: {
          active: false,
          lastAudit: { status: 'blocked', ...report.summary },
        },
      },
    })
  })

  it('keeps maintenance active when the final audit is blocked', async () => {
    mocks.sourceHashBackfillMaintenance.mockReturnValue(active)
    mocks.auditStoredSourceHashes.mockResolvedValue({
      status: 'blocked',
      summary: { total: 1, active: 1, recycled: 0, current: 0, missing: 1, mismatched: 0, invalid: 0 },
    })

    await expect(complete.orThrow.call(context, {})).rejects.toMatchObject({
      code: 'CONFLICT',
      message: expect.stringContaining('source_hash_audit_blocked'),
    })
    expect(mocks.updateGlobalConfig).not.toHaveBeenCalled()
  })

  it('records a ready audit and closes maintenance only after every Source is current', async () => {
    mocks.sourceHashBackfillMaintenance.mockReturnValue(active)
    const report = {
      status: 'ready',
      summary: { total: 3, active: 2, recycled: 1, current: 3, missing: 0, mismatched: 0, invalid: 0 },
    }
    mocks.auditStoredSourceHashes.mockResolvedValue(report)

    await expect(complete.orThrow.call(context, {})).resolves.toEqual(report)
    expect(mocks.updateGlobalConfig).toHaveBeenCalledWith(env, {
      maintenance: {
        sourceHashBackfill: expect.objectContaining({
          active: false,
          completedAt: expect.any(String),
          lastAudit: { status: 'ready', ...report.summary },
        }),
      },
    })
  })

  it('reports the persisted maintenance record to an admin', async () => {
    mocks.sourceHashBackfillMaintenance.mockReturnValue(active)

    await expect(status.orThrow.call(context, {})).resolves.toEqual({
      maintenance: active,
      sourceHashSchemaReady: true,
    })
  })
})
