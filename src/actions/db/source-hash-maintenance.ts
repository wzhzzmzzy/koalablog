import { auditStoredSourceHashes, backfillSourceHashBatch, hasSourceHashSchema } from '@/db/source-hash-maintenance'
import { readTemplateCatalog, upgradeStoredTemplateCatalog } from '@/db/template-catalog'
import {
  globalConfig,
  sourceHashBackfillMaintenance,
  updateGlobalConfig,
  type SourceHashBackfillMaintenance,
} from '@/lib/kv'
import { ActionError, defineAction } from 'astro:actions'
import { z } from 'astro:schema'
import { authGuard } from '../utils/auth'

const applicationCommit = z.string().regex(/^[0-9a-f]{7,64}$/i, 'Commit must be a Git SHA')
const operator = z.string().trim().min(1, 'Operator is required').max(128)
const batchInput = z.object({
  afterId: z.number().int().nonnegative().default(0),
  batchSize: z.number().int().min(1).max(500).default(100),
}).strict()

function blocked(message: string): never {
  throw new ActionError({ code: 'CONFLICT', message })
}

function deployedApplicationCommit(env: Env | undefined): string {
  const deployment = env as (Env & {
    KOALA_RELEASE_COMMIT?: string
    CF_PAGES_COMMIT_SHA?: string
  }) | undefined
  const commit = deployment?.KOALA_RELEASE_COMMIT ?? deployment?.CF_PAGES_COMMIT_SHA
  if (!commit || !/^[0-9a-f]{7,64}$/i.test(commit))
    blocked('Source Hash maintenance requires a configured deployed Git commit')
  return commit.toLowerCase()
}

function initialProgress(): NonNullable<SourceHashBackfillMaintenance['progress']> {
  return { afterId: 0, done: false, batches: 0, processed: 0, updated: 0, skipped: 0, invalid: 0, retried: 0 }
}

function auditRecord(report: Awaited<ReturnType<typeof auditStoredSourceHashes>>) {
  return {
    status: report.status,
    ...report.summary,
  }
}

async function prepareTemplateCatalog(env: Env | undefined) {
  const current = await readTemplateCatalog(env)
  if (current.status !== 'ready' || current.catalog.schemaVersion === 2)
    return current.status === 'ready'
      ? { status: 'already_current' as const, catalog: current.catalog }
      : current

  const upgraded = await upgradeStoredTemplateCatalog(env, current.catalog.revision)
  if (upgraded.status === 'conflict')
    blocked(JSON.stringify({ code: 'template_catalog_conflict', currentRevision: upgraded.currentRevision }))
  return upgraded
}

async function currentMaintenance(env: Env | undefined): Promise<SourceHashBackfillMaintenance> {
  return sourceHashBackfillMaintenance(await globalConfig(env))
}

async function requireActiveMaintenance(env: Env | undefined): Promise<SourceHashBackfillMaintenance> {
  const maintenance = await currentMaintenance(env)
  if (!maintenance.active)
    blocked('Source Hash maintenance is not active')
  return maintenance
}

export const status = defineAction({
  accept: 'json',
  input: z.object({}).strict().default({}),
  handler: async (_, ctx) => {
    await authGuard(ctx)
    const env = ctx.locals.runtime?.env
    return {
      maintenance: await currentMaintenance(env),
      sourceHashSchemaReady: await hasSourceHashSchema(env),
    }
  },
})

export const start = defineAction({
  accept: 'json',
  input: z.object({ applicationCommit, operator }).strict(),
  handler: async ({ applicationCommit, operator }, ctx) => {
    await authGuard(ctx)
    const env = ctx.locals.runtime?.env
    const deployedCommit = deployedApplicationCommit(env)
    if (applicationCommit.toLowerCase() !== deployedCommit)
      blocked('The supplied commit does not match the deployed application commit')
    if (!await hasSourceHashSchema(env))
      blocked('Source Hash schema is unavailable; apply migration 0003 before maintenance')
    const existing = await currentMaintenance(env)
    if (existing.active) {
      if (existing.applicationCommit !== applicationCommit.toLowerCase())
        blocked('Source Hash maintenance is already active for another application commit')
      return { maintenance: existing, templateCatalog: await prepareTemplateCatalog(env) }
    }

    const templateCatalog = await prepareTemplateCatalog(env)
    const maintenance: SourceHashBackfillMaintenance = {
      active: true,
      applicationCommit: deployedCommit,
      operator,
      startedAt: new Date().toISOString(),
      completedAt: undefined,
      lastAudit: undefined,
      progress: initialProgress(),
    }
    await updateGlobalConfig(env || {}, { maintenance: { sourceHashBackfill: maintenance } })
    return { maintenance, templateCatalog }
  },
})

export const backfill = defineAction({
  accept: 'json',
  input: batchInput,
  handler: async ({ afterId, batchSize }, ctx) => {
    await authGuard(ctx)
    const env = ctx.locals.runtime?.env
    const maintenance = await requireActiveMaintenance(env)
    const progress = maintenance.progress ?? initialProgress()
    if (afterId !== progress.afterId)
      blocked(JSON.stringify({ code: 'source_hash_backfill_cursor_conflict', expectedAfterId: progress.afterId }))

    const batch = await backfillSourceHashBatch(env, { afterId, limit: batchSize })
    const updatedMaintenance: SourceHashBackfillMaintenance = {
      ...maintenance,
      progress: {
        afterId: batch.nextAfterId,
        done: batch.done,
        batches: progress.batches + 1,
        processed: progress.processed + batch.counts.processed,
        updated: progress.updated + batch.counts.updated,
        skipped: progress.skipped + batch.counts.skipped,
        invalid: progress.invalid + batch.counts.invalid,
        retried: progress.retried + batch.counts.retried,
      },
    }
    await updateGlobalConfig(env || {}, { maintenance: { sourceHashBackfill: updatedMaintenance } })
    return { batch, maintenance: updatedMaintenance }
  },
})

export const audit = defineAction({
  accept: 'json',
  input: z.object({ batchSize: z.number().int().min(1).max(500).default(100) }).strict().default({}),
  handler: async ({ batchSize }, ctx) => {
    await authGuard(ctx)
    const env = ctx.locals.runtime?.env
    const report = await auditStoredSourceHashes(env, batchSize)
    const maintenance = await currentMaintenance(env)
    await updateGlobalConfig(env || {}, {
      maintenance: {
        sourceHashBackfill: {
          ...maintenance,
          lastAudit: auditRecord(report),
        },
      },
    })
    return report
  },
})

export const complete = defineAction({
  accept: 'json',
  input: z.object({}).strict().default({}),
  handler: async (_, ctx) => {
    await authGuard(ctx)
    const env = ctx.locals.runtime?.env
    const maintenance = await requireActiveMaintenance(env)
    const report = await auditStoredSourceHashes(env, 100)
    if (report.status !== 'ready')
      blocked(JSON.stringify({ code: 'source_hash_audit_blocked', summary: report.summary }))

    await updateGlobalConfig(env || {}, {
      maintenance: {
        sourceHashBackfill: {
          ...maintenance,
          active: false,
          completedAt: new Date().toISOString(),
          lastAudit: auditRecord(report),
        },
      },
    })
    return report
  },
})
