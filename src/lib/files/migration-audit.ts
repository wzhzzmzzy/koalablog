import type { AbsoluteFilePath, PathError, PathErrorCode, Result } from './types'
import { createHash } from 'node:crypto'
import { classifySource, deriveTitle, parseAbsoluteFilePath } from './path'

export type LegacyTimestamp = Date | number | string

export interface LegacyFileRow {
  id: number
  source: number
  link: string
  subject: string
  content: string | null
  tags: string | null
  incoming_links: string | null
  outgoing_links: string | null
  private: boolean | number
  remoteTruth: boolean | number
  createdAt: LegacyTimestamp
  updatedAt: LegacyTimestamp
  deletedAt: LegacyTimestamp | null
}

export interface MigrationDuplicateGroup {
  normalizedPath: AbsoluteFilePath
  activeIds: number[]
  recycledIds: number[]
}

export interface InvalidLegacyPath {
  id: number
  state: 'active' | 'recycled'
  rawPath: string
  errorCode: PathErrorCode
}

export interface LegacySubjectDifference {
  id: number
  state: 'active' | 'recycled'
  normalizedPath: AbsoluteFilePath
  legacySubject: string
  derivedTitle: string
}

export interface DerivedTitleDuplicate {
  derivedTitle: string
  activeIds: number[]
}

export interface ClassificationMismatch {
  id: number
  state: 'active' | 'recycled'
  normalizedPath: AbsoluteFilePath
  storedSource: number
  derivedSource: number
}

export interface MigrationRowProjection {
  id: number
  path: AbsoluteFilePath
  title: string
  state: 'active' | 'recycled'
}

export interface PreservationCheck {
  rowCount: number
  sha256: string
}

export interface MigrationPreservationManifest {
  ids: PreservationCheck
  content: PreservationCheck
  timestamps: PreservationCheck
  privacy: PreservationCheck
  remoteTruth: PreservationCheck
  classification: PreservationCheck
  tags: PreservationCheck
  references: PreservationCheck
  recycleBin: PreservationCheck
}

export type MigrationAbortReason =
  | { code: 'active_path_collision', normalizedPath: AbsoluteFilePath, rowIds: number[] }
  | { code: 'invalid_active_path', rawPath: string, rowIds: number[] }

export interface FileMigrationAuditReport {
  schemaVersion: 1
  status: 'ready' | 'blocked'
  summary: {
    totalRows: number
    activeRows: number
    recycledRows: number
    validRows: number
    invalidRows: number
    privateRows: number
    remoteTruthRows: number
    sourceCounts: Record<string, number>
  }
  abortReasons: MigrationAbortReason[]
  activeCollisions: MigrationDuplicateGroup[]
  activeRecycledDuplicates: MigrationDuplicateGroup[]
  recycledDuplicates: MigrationDuplicateGroup[]
  invalidPaths: InvalidLegacyPath[]
  subjectDifferences: LegacySubjectDifference[]
  derivedTitleDuplicates: DerivedTitleDuplicate[]
  classificationMismatches: ClassificationMismatch[]
  projectedRows: MigrationRowProjection[]
  preservation: MigrationPreservationManifest
}

export class MigrationAuditInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MigrationAuditInputError'
  }
}

export function normalizeLegacyFilePath(input: string): Result<AbsoluteFilePath, PathError> {
  return parseAbsoluteFilePath(input.startsWith('/') ? input : `/${input}`)
}

function snapshotRows(input: unknown): unknown[] {
  if (!Array.isArray(input))
    throw new MigrationAuditInputError('Migration snapshot must be an array')
  if (input.every(item => item && typeof item === 'object' && Array.isArray((item as { results?: unknown }).results))) {
    return input.flatMap(item => (item as { results: unknown[] }).results)
  }
  return input
}

export function parseLegacyFileSnapshot(input: unknown): LegacyFileRow[] {
  return snapshotRows(input).map((candidate, index) => {
    if (!candidate || typeof candidate !== 'object')
      throw new MigrationAuditInputError(`Migration snapshot row ${index} must be an object`)

    const row = candidate as Record<string, unknown>
    const requiredNumbers = ['id', 'source'] as const
    const requiredStrings = ['link', 'subject'] as const
    const nullableStrings = ['content', 'tags', 'incoming_links', 'outgoing_links'] as const
    for (const field of requiredNumbers) {
      if (typeof row[field] !== 'number')
        throw new MigrationAuditInputError(`Migration snapshot row ${index} field ${field} must be a number`)
    }
    for (const field of requiredStrings) {
      if (typeof row[field] !== 'string')
        throw new MigrationAuditInputError(`Migration snapshot row ${index} field ${field} must be a string`)
    }
    for (const field of nullableStrings) {
      if (row[field] !== null && typeof row[field] !== 'string')
        throw new MigrationAuditInputError(`Migration snapshot row ${index} field ${field} must be a string or null`)
    }
    for (const field of ['private', 'remoteTruth'] as const) {
      if (typeof row[field] !== 'boolean' && typeof row[field] !== 'number')
        throw new MigrationAuditInputError(`Migration snapshot row ${index} field ${field} must be a boolean or number`)
    }
    for (const field of ['createdAt', 'updatedAt'] as const) {
      if (!(row[field] instanceof Date) && typeof row[field] !== 'number' && typeof row[field] !== 'string')
        throw new MigrationAuditInputError(`Migration snapshot row ${index} field ${field} must be a timestamp`)
    }
    if (row.deletedAt !== null && !(row.deletedAt instanceof Date) && typeof row.deletedAt !== 'number' && typeof row.deletedAt !== 'string')
      throw new MigrationAuditInputError(`Migration snapshot row ${index} field deletedAt must be a timestamp or null`)

    return row as unknown as LegacyFileRow
  })
}

function comparePaths(left: MigrationDuplicateGroup, right: MigrationDuplicateGroup): number {
  return left.normalizedPath < right.normalizedPath ? -1 : left.normalizedPath > right.normalizedPath ? 1 : 0
}

function canonicalTimestamp(value: LegacyTimestamp): string {
  const date = value instanceof Date
    ? value
    : new Date(typeof value === 'number' && value < 1_000_000_000_000 ? value * 1000 : value)
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString()
}

function preservationCheck<T>(rows: LegacyFileRow[], select: (row: LegacyFileRow) => T): PreservationCheck {
  const serialized = JSON.stringify(rows.map(row => [row.id, select(row)]))
  return {
    rowCount: rows.length,
    sha256: createHash('sha256').update(serialized).digest('hex'),
  }
}

function preservationManifest(rows: LegacyFileRow[]): MigrationPreservationManifest {
  return {
    ids: preservationCheck(rows, row => row.id),
    content: preservationCheck(rows, row => row.content),
    timestamps: preservationCheck(rows, row => [canonicalTimestamp(row.createdAt), canonicalTimestamp(row.updatedAt)]),
    privacy: preservationCheck(rows, row => Boolean(row.private)),
    remoteTruth: preservationCheck(rows, row => Boolean(row.remoteTruth)),
    classification: preservationCheck(rows, row => row.source),
    tags: preservationCheck(rows, row => row.tags),
    references: preservationCheck(rows, row => [row.incoming_links, row.outgoing_links]),
    recycleBin: preservationCheck(rows, row => row.deletedAt === null ? null : canonicalTimestamp(row.deletedAt)),
  }
}

export function auditLegacyFileRows(input: LegacyFileRow[]): FileMigrationAuditReport {
  const rows = [...input].sort((left, right) => left.id - right.id)
  const invalidPaths: InvalidLegacyPath[] = []
  const subjectDifferences: LegacySubjectDifference[] = []
  const classificationMismatches: ClassificationMismatch[] = []
  const projectedRows: MigrationRowProjection[] = []
  const pathGroups = new Map<AbsoluteFilePath, { activeIds: number[], recycledIds: number[] }>()
  const activeTitleGroups = new Map<string, number[]>()

  for (const row of rows) {
    const state = row.deletedAt === null ? 'active' as const : 'recycled' as const
    const normalized = normalizeLegacyFilePath(row.link)
    if (!normalized.ok) {
      invalidPaths.push({ id: row.id, state, rawPath: row.link, errorCode: normalized.error.code })
      continue
    }

    const group = pathGroups.get(normalized.value) ?? { activeIds: [], recycledIds: [] }
    group[state === 'active' ? 'activeIds' : 'recycledIds'].push(row.id)
    pathGroups.set(normalized.value, group)

    const derivedTitle = deriveTitle(normalized.value)
    projectedRows.push({ id: row.id, path: normalized.value, title: derivedTitle, state })
    if (state === 'active') {
      const titleIds = activeTitleGroups.get(derivedTitle) ?? []
      titleIds.push(row.id)
      activeTitleGroups.set(derivedTitle, titleIds)
    }
    if (row.subject !== derivedTitle) {
      subjectDifferences.push({
        id: row.id,
        state,
        normalizedPath: normalized.value,
        legacySubject: row.subject,
        derivedTitle,
      })
    }

    const derivedSource = classifySource(normalized.value)
    if (derivedSource !== row.source) {
      classificationMismatches.push({
        id: row.id,
        state,
        normalizedPath: normalized.value,
        storedSource: row.source,
        derivedSource,
      })
    }
  }

  const groups = Array.from(pathGroups, ([normalizedPath, ids]) => ({ normalizedPath, ...ids }))
    .sort(comparePaths)
  const activeCollisions = groups.filter(group => group.activeIds.length > 1)
  const activeRecycledDuplicates = groups.filter(group => group.activeIds.length > 0 && group.recycledIds.length > 0)
  const recycledDuplicates = groups.filter(group => group.recycledIds.length > 1)
  const abortReasons: MigrationAbortReason[] = [
    ...activeCollisions.map(group => ({
      code: 'active_path_collision' as const,
      normalizedPath: group.normalizedPath,
      rowIds: group.activeIds,
    })),
    ...invalidPaths
      .filter(path => path.state === 'active')
      .map(path => ({ code: 'invalid_active_path' as const, rawPath: path.rawPath, rowIds: [path.id] })),
  ]
  const sourceCounts = rows.reduce<Record<string, number>>((counts, row) => {
    const source = String(row.source)
    counts[source] = (counts[source] ?? 0) + 1
    return counts
  }, {})
  const derivedTitleDuplicates = Array.from(activeTitleGroups, ([derivedTitle, activeIds]) => ({ derivedTitle, activeIds }))
    .filter(group => group.activeIds.length > 1)
    .sort((left, right) => left.derivedTitle < right.derivedTitle ? -1 : left.derivedTitle > right.derivedTitle ? 1 : 0)

  return {
    schemaVersion: 1,
    status: abortReasons.length > 0 ? 'blocked' : 'ready',
    summary: {
      totalRows: rows.length,
      activeRows: rows.filter(row => row.deletedAt === null).length,
      recycledRows: rows.filter(row => row.deletedAt !== null).length,
      validRows: rows.length - invalidPaths.length,
      invalidRows: invalidPaths.length,
      privateRows: rows.filter(row => Boolean(row.private)).length,
      remoteTruthRows: rows.filter(row => Boolean(row.remoteTruth)).length,
      sourceCounts,
    },
    abortReasons,
    activeCollisions,
    activeRecycledDuplicates,
    recycledDuplicates,
    invalidPaths,
    subjectDifferences,
    derivedTitleDuplicates,
    classificationMismatches,
    projectedRows,
    preservation: preservationManifest(rows),
  }
}

export function serializeFileMigrationAudit(report: FileMigrationAuditReport): string {
  return `${JSON.stringify(report, null, 2)}\n`
}

export function formatFileMigrationAudit(report: FileMigrationAuditReport): string {
  const lines = [
    'Koalablog File Migration Audit v1',
    `Status: ${report.status.toUpperCase()}`,
    `Rows: ${report.summary.totalRows} total, ${report.summary.activeRows} active, ${report.summary.recycledRows} recycled`,
    `Paths: ${report.summary.validRows} valid, ${report.summary.invalidRows} invalid`,
  ]

  for (const reason of report.abortReasons) {
    lines.push(reason.code === 'active_path_collision'
      ? `Abort active collision: ${reason.normalizedPath} (rows: ${reason.rowIds.join(', ')})`
      : `Abort invalid active Path: ${reason.rawPath} (rows: ${reason.rowIds.join(', ')})`)
  }
  for (const group of report.activeRecycledDuplicates) {
    lines.push(`Active/recycled duplicate: ${group.normalizedPath} (active: ${group.activeIds.join(', ')}; recycled: ${group.recycledIds.join(', ')})`)
  }
  for (const group of report.recycledDuplicates) {
    lines.push(`Recycled duplicate: ${group.normalizedPath} (rows: ${group.recycledIds.join(', ')})`)
  }
  for (const path of report.invalidPaths) {
    lines.push(`Invalid Path: #${path.id} ${path.state} ${JSON.stringify(path.rawPath)} (${path.errorCode})`)
  }
  for (const difference of report.subjectDifferences) {
    lines.push(`Subject difference: #${difference.id} ${difference.state} ${JSON.stringify(difference.legacySubject)} -> ${JSON.stringify(difference.derivedTitle)} (${difference.normalizedPath})`)
  }
  for (const mismatch of report.classificationMismatches) {
    lines.push(`Classification difference: #${mismatch.id} ${mismatch.normalizedPath} stored ${mismatch.storedSource}, derived ${mismatch.derivedSource}`)
  }
  for (const duplicate of report.derivedTitleDuplicates) {
    lines.push(`Non-blocking derived Title duplicate: ${JSON.stringify(duplicate.derivedTitle)} (active rows: ${duplicate.activeIds.join(', ')})`)
  }
  for (const [field, check] of Object.entries(report.preservation))
    lines.push(`Preservation ${field}: ${check.rowCount} rows, sha256 ${check.sha256}`)

  return `${lines.join('\n')}\n`
}
