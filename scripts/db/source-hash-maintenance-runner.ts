import type { SourceHashBackfillBatchResult } from '../../src/db/source-hash-maintenance'
import type { SourceHashAuditReport } from '../../src/lib/files/source-hash-audit'
import type { SourceHashOperatorStore } from './source-hash-maintenance-target'
import { runSourceHashBackfillBatch, runStoredSourceHashAudit } from '../../src/db/source-hash-maintenance'
import { parseStoredTemplateCatalogRow } from '../../src/db/template-catalog'
import { upgradeTemplateCatalogV1 } from '../../src/lib/files/template'

export type SourceHashMaintenanceTarget =
  | { kind: 'sqlite', database: string, backupManifest: string }
  | { kind: 'd1', database: string, mode: 'local' | 'remote', persistTo?: string }

export interface SourceHashMaintenanceMetadata {
  target: SourceHashMaintenanceTarget
  applicationCommit: string
  migrationStage: string
  operator: string
  operatorTimestamp: string
  batchSize: number
}

export interface SourceHashMaintenanceReport {
  schemaVersion: 1
  status: 'ready' | 'blocked'
  target: SourceHashMaintenanceTarget
  applicationCommit: string
  migrationStage: string
  operator: string
  operatorTimestamp: string
  maintenanceConfirmed: true
  templateCatalog:
    | { status: 'absent' }
    | { status: 'already_current', currentRevision: number }
    | { status: 'upgraded', previousRevision: number, currentRevision: number }
    | { status: 'conflict', currentRevision: number }
  backfill: {
    batches: number
    counts: SourceHashBackfillBatchResult['counts']
    skippedRevisions: Array<{
      id: number
      observedRevision: number
      attempts: 1 | 2
      reason?: string
    }>
  }
  audit: SourceHashAuditReport
}

async function upgradeTemplateCatalog(store: SourceHashOperatorStore): Promise<SourceHashMaintenanceReport['templateCatalog']> {
  const row = await store.readTemplateCatalogRow()
  if (!row)
    return { status: 'absent' }

  const catalog = parseStoredTemplateCatalogRow(row)
  if (catalog.schemaVersion === 2)
    return { status: 'already_current', currentRevision: catalog.revision }

  const upgraded = upgradeTemplateCatalogV1(catalog)
  if (await store.compareAndSetTemplateCatalog({
    baseRevision: catalog.revision,
    payload: JSON.stringify(upgraded.templates),
  })) {
    return {
      status: 'upgraded',
      previousRevision: catalog.revision,
      currentRevision: catalog.revision + 1,
    }
  }

  const latestRow = await store.readTemplateCatalogRow()
  if (!latestRow)
    return { status: 'absent' }
  const latest = parseStoredTemplateCatalogRow(latestRow)
  if (latest.schemaVersion === 2)
    return { status: 'already_current', currentRevision: latest.revision }
  return { status: 'conflict', currentRevision: latest.revision }
}

function emptyCounts(): SourceHashBackfillBatchResult['counts'] {
  return { processed: 0, updated: 0, skipped: 0, invalid: 0, retried: 0 }
}

function addCounts(
  total: SourceHashBackfillBatchResult['counts'],
  batch: SourceHashBackfillBatchResult['counts'],
): void {
  for (const key of Object.keys(total) as Array<keyof typeof total>)
    total[key] += batch[key]
}

export async function runSourceHashMaintenance(
  store: SourceHashOperatorStore,
  metadata: SourceHashMaintenanceMetadata,
): Promise<SourceHashMaintenanceReport> {
  const templateCatalog = await upgradeTemplateCatalog(store)
  const counts = emptyCounts()
  const skippedRevisions: SourceHashMaintenanceReport['backfill']['skippedRevisions'] = []
  let batches = 0
  let afterId = 0

  while (true) {
    const batch = await runSourceHashBackfillBatch(store, { afterId, limit: metadata.batchSize })
    batches += 1
    addCounts(counts, batch.counts)
    skippedRevisions.push(...batch.outcomes
      .filter(outcome => outcome.status === 'skipped')
      .map(outcome => ({
        id: outcome.id,
        observedRevision: outcome.observedRevision,
        attempts: outcome.attempts,
        reason: outcome.reason,
      })))
    if (batch.done)
      break
    afterId = batch.nextAfterId
  }

  const audit = await runStoredSourceHashAudit(store, metadata.batchSize)
  const status = templateCatalog.status === 'conflict' || counts.invalid > 0 || audit.status === 'blocked'
    ? 'blocked'
    : 'ready'

  return {
    schemaVersion: 1,
    status,
    target: metadata.target,
    applicationCommit: metadata.applicationCommit,
    migrationStage: metadata.migrationStage,
    operator: metadata.operator,
    operatorTimestamp: new Date(metadata.operatorTimestamp).toISOString(),
    maintenanceConfirmed: true,
    templateCatalog,
    backfill: { batches, counts, skippedRevisions },
    audit,
  }
}
