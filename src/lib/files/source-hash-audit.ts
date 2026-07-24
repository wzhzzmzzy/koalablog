import { calculateSourceHash } from './source-hash'
import { isRendererMode } from './types'

export interface SourceHashAuditRow {
  id: number
  renderer: unknown
  content: unknown
  sourceHash: unknown
  revision: number
  deletedAt: unknown
}

export type SourceHashAuditIssueCode =
  | 'invalid_renderer'
  | 'invalid_content'
  | 'invalid_source_hash'
  | 'missing_source_hash'
  | 'source_hash_mismatch'

export interface SourceHashAuditIssue {
  id: number
  revision: number
  state: 'active' | 'recycled'
  code: SourceHashAuditIssueCode
  storedHash?: string | null
  expectedHash?: string
}

export interface SourceHashAuditReport {
  schemaVersion: 1
  status: 'ready' | 'blocked'
  summary: {
    total: number
    active: number
    recycled: number
    current: number
    missing: number
    mismatched: number
    invalid: number
  }
  issues: SourceHashAuditIssue[]
}

const SHA256_HEX = /^[0-9a-f]{64}$/

export async function canonicalSourceHashForRecord(input: Pick<SourceHashAuditRow, 'renderer' | 'content'>): Promise<
  | { ok: true, hash: string }
  | { ok: false, code: 'invalid_renderer' | 'invalid_content' }
> {
  if (!isRendererMode(input.renderer))
    return { ok: false, code: 'invalid_renderer' }
  if (typeof input.content !== 'string')
    return { ok: false, code: 'invalid_content' }
  return { ok: true, hash: await calculateSourceHash(input.renderer, input.content) }
}

export async function auditSourceHashRows(input: readonly SourceHashAuditRow[]): Promise<SourceHashAuditReport> {
  const rows = [...input].sort((left, right) => left.id - right.id)
  const issues: SourceHashAuditIssue[] = []
  let current = 0
  let missing = 0
  let mismatched = 0
  let invalid = 0

  for (const row of rows) {
    const state = row.deletedAt === null ? 'active' as const : 'recycled' as const
    const issueIdentity = { id: row.id, revision: row.revision, state }
    const canonical = await canonicalSourceHashForRecord(row)
    if (!canonical.ok) {
      invalid += 1
      issues.push({ ...issueIdentity, code: canonical.code })
      continue
    }

    const expectedHash = canonical.hash
    if (row.sourceHash === null) {
      missing += 1
      issues.push({ ...issueIdentity, code: 'missing_source_hash', storedHash: null, expectedHash })
      continue
    }
    if (typeof row.sourceHash !== 'string' || !SHA256_HEX.test(row.sourceHash)) {
      invalid += 1
      issues.push({
        ...issueIdentity,
        code: 'invalid_source_hash',
        storedHash: typeof row.sourceHash === 'string' ? row.sourceHash : undefined,
        expectedHash,
      })
      continue
    }
    if (row.sourceHash !== expectedHash) {
      mismatched += 1
      issues.push({ ...issueIdentity, code: 'source_hash_mismatch', storedHash: row.sourceHash, expectedHash })
      continue
    }
    current += 1
  }

  return {
    schemaVersion: 1,
    status: issues.length === 0 ? 'ready' : 'blocked',
    summary: {
      total: rows.length,
      active: rows.filter(row => row.deletedAt === null).length,
      recycled: rows.filter(row => row.deletedAt !== null).length,
      current,
      missing,
      mismatched,
      invalid,
    },
    issues,
  }
}
