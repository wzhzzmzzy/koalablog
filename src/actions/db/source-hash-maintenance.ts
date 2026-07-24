import { auditStoredSourceHashes, backfillSourceHashBatch } from '@/db/source-hash-maintenance'
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
const batchInput = z.object({
  afterId: z.number().int().nonnegative().default(0),
  batchSize: z.number().int().min(1).max(500).default(100),
}).strict()

function blocked(message: string): never {
  throw new ActionError({ code: 'CONFLICT', message })
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
    return currentMaintenance(ctx.locals.runtime?.env)
  },
})

export const start = defineAction({
  accept: 'json',
  input: z.object({ applicationCommit }).strict(),
  handler: async ({ applicationCommit }, ctx) => {
    await authGuard(ctx)
    const env = ctx.locals.runtime?.env
    const existing = await currentMaintenance(env)
    if (existing.active) {
      if (existing.applicationCommit !== applicationCommit)
        blocked('Source Hash maintenance is already active for another application commit')
      return { maintenance: existing, templateCatalog: await prepareTemplateCatalog(env) }
    }

    const templateCatalog = await prepareTemplateCatalog(env)
    const maintenance: SourceHashBackfillMaintenance = {
      active: true,
      applicationCommit,
      startedAt: new Date().toISOString(),
      completedAt: undefined,
      lastAudit: undefined,
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
    await requireActiveMaintenance(env)
    return backfillSourceHashBatch(env, { afterId, limit: batchSize })
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
