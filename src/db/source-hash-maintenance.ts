import type { SourceHashAuditReport, SourceHashAuditRow } from '@/lib/files/source-hash-audit'
import { connectDB } from '@/db'
import { auditSourceHashRows, canonicalSourceHashForRecord } from '@/lib/files/source-hash-audit'
import { and, asc, eq, gt, isNull } from 'drizzle-orm'
import { markdown } from './schema'

const MAX_MAINTENANCE_BATCH_SIZE = 500

export interface SourceHashMaintenanceStore {
  readMissingBatch: (afterId: number, limit: number) => Promise<SourceHashAuditRow[]>
  readAuditBatch: (afterId: number, limit: number) => Promise<SourceHashAuditRow[]>
  compareAndSetSourceHash: (input: { id: number, baseRevision: number, sourceHash: string }) => Promise<boolean>
  readById: (id: number) => Promise<SourceHashAuditRow | null>
}

export interface SourceHashBackfillBatchInput {
  afterId: number
  limit: number
}

export interface SourceHashBackfillOutcome {
  id: number
  observedRevision: number
  status: 'updated' | 'skipped' | 'invalid'
  attempts: 1 | 2
  reason?: 'invalid_renderer' | 'invalid_content' | 'already_current' | 'source_hash_present' | 'revision_conflict' | 'missing'
}

export interface SourceHashBackfillBatchResult {
  schemaVersion: 1
  afterId: number
  nextAfterId: number
  done: boolean
  counts: {
    processed: number
    updated: number
    skipped: number
    invalid: number
    retried: number
  }
  outcomes: SourceHashBackfillOutcome[]
}

export function createSourceHashMaintenanceStore(env?: Env): SourceHashMaintenanceStore {
  const database = connectDB(env)

  return {
    readMissingBatch: (afterId, limit) => database
      .select()
      .from(markdown)
      .where(and(gt(markdown.id, afterId), isNull(markdown.sourceHash)))
      .orderBy(asc(markdown.id))
      .limit(limit),
    readAuditBatch: (afterId, limit) => database
      .select()
      .from(markdown)
      .where(gt(markdown.id, afterId))
      .orderBy(asc(markdown.id))
      .limit(limit),
    compareAndSetSourceHash: async (input) => {
      const [updated] = await database
        .update(markdown)
        .set({ sourceHash: input.sourceHash })
        .where(and(
          eq(markdown.id, input.id),
          eq(markdown.revision, input.baseRevision),
          isNull(markdown.sourceHash),
        ))
        .returning()
      return Boolean(updated)
    },
    readById: async (id) => {
      const [row] = await database.select().from(markdown).where(eq(markdown.id, id)).limit(1)
      return row ?? null
    },
  }
}

function validateBatchLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_MAINTENANCE_BATCH_SIZE)
    throw new RangeError(`Source Hash maintenance limit must be between 1 and ${MAX_MAINTENANCE_BATCH_SIZE}`)
}

function validateBatchInput(input: SourceHashBackfillBatchInput): void {
  if (!Number.isInteger(input.afterId) || input.afterId < 0)
    throw new RangeError('Source Hash backfill afterId must be a non-negative integer')
  validateBatchLimit(input.limit)
}

export async function runSourceHashBackfillBatch(
  store: SourceHashMaintenanceStore,
  input: SourceHashBackfillBatchInput,
): Promise<SourceHashBackfillBatchResult> {
  validateBatchInput(input)
  const rows = await store.readMissingBatch(input.afterId, input.limit)
  const outcomes: SourceHashBackfillOutcome[] = []
  let retried = 0

  for (const row of rows) {
    const canonical = await canonicalSourceHashForRecord(row)
    if (!canonical.ok) {
      outcomes.push({
        id: row.id,
        observedRevision: row.revision,
        status: 'invalid',
        attempts: 1,
        reason: canonical.code,
      })
      continue
    }

    const updated = await store.compareAndSetSourceHash({
      id: row.id,
      baseRevision: row.revision,
      sourceHash: canonical.hash,
    })
    if (updated) {
      outcomes.push({ id: row.id, observedRevision: row.revision, status: 'updated', attempts: 1 })
      continue
    }

    const fresh = await store.readById(row.id)
    if (!fresh) {
      outcomes.push({ id: row.id, observedRevision: row.revision, status: 'skipped', attempts: 1, reason: 'missing' })
      continue
    }
    const freshCanonical = await canonicalSourceHashForRecord(fresh)
    if (!freshCanonical.ok) {
      outcomes.push({
        id: row.id,
        observedRevision: row.revision,
        status: 'invalid',
        attempts: 1,
        reason: freshCanonical.code,
      })
      continue
    }
    if (fresh.sourceHash === freshCanonical.hash) {
      outcomes.push({ id: row.id, observedRevision: row.revision, status: 'skipped', attempts: 1, reason: 'already_current' })
      continue
    }
    if (fresh.sourceHash !== null) {
      outcomes.push({ id: row.id, observedRevision: row.revision, status: 'skipped', attempts: 1, reason: 'source_hash_present' })
      continue
    }

    retried += 1
    const retriedUpdate = await store.compareAndSetSourceHash({
      id: fresh.id,
      baseRevision: fresh.revision,
      sourceHash: freshCanonical.hash,
    })
    outcomes.push(retriedUpdate
      ? { id: row.id, observedRevision: row.revision, status: 'updated', attempts: 2 }
      : { id: row.id, observedRevision: row.revision, status: 'skipped', attempts: 2, reason: 'revision_conflict' })
  }

  return {
    schemaVersion: 1,
    afterId: input.afterId,
    nextAfterId: rows.at(-1)?.id ?? input.afterId,
    done: rows.length < input.limit,
    counts: {
      processed: outcomes.length,
      updated: outcomes.filter(outcome => outcome.status === 'updated').length,
      skipped: outcomes.filter(outcome => outcome.status === 'skipped').length,
      invalid: outcomes.filter(outcome => outcome.status === 'invalid').length,
      retried,
    },
    outcomes,
  }
}

export function backfillSourceHashBatch(env: Env | undefined, input: SourceHashBackfillBatchInput) {
  return runSourceHashBackfillBatch(createSourceHashMaintenanceStore(env), input)
}

export async function runStoredSourceHashAudit(
  store: SourceHashMaintenanceStore,
  batchSize = MAX_MAINTENANCE_BATCH_SIZE,
): Promise<SourceHashAuditReport> {
  validateBatchLimit(batchSize)
  const summary: SourceHashAuditReport['summary'] = {
    total: 0,
    active: 0,
    recycled: 0,
    current: 0,
    missing: 0,
    mismatched: 0,
    invalid: 0,
  }
  const issues: SourceHashAuditReport['issues'] = []
  let afterId = 0

  while (true) {
    const rows = await store.readAuditBatch(afterId, batchSize)
    const batch = await auditSourceHashRows(rows)
    for (const key of Object.keys(summary) as (keyof typeof summary)[])
      summary[key] += batch.summary[key]
    issues.push(...batch.issues)

    if (rows.length < batchSize)
      break
    afterId = rows.at(-1)!.id
  }

  return {
    schemaVersion: 1,
    status: issues.length === 0 ? 'ready' : 'blocked',
    summary,
    issues,
  }
}

export function auditStoredSourceHashes(env?: Env, batchSize = MAX_MAINTENANCE_BATCH_SIZE): Promise<SourceHashAuditReport> {
  return runStoredSourceHashAudit(createSourceHashMaintenanceStore(env), batchSize)
}
