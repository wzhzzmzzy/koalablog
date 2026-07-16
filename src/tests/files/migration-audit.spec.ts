import {
  auditLegacyFileRows,
  formatFileMigrationAudit,
  normalizeLegacyFilePath,
  parseLegacyFileSnapshot,
  serializeFileMigrationAudit,
} from '@/lib/files/migration-audit'
import { blockingLegacyFileRows, successfulLegacyFileRows } from '@/tests/fixtures/file-migration'
import { describe, expect, it } from 'vitest'

describe('legacy File Path audit', () => {
  it('normalizes relative and repeated-slash links through the canonical File Path rules', () => {
    expect(normalizeLegacyFilePath('memo/hello')).toEqual({ ok: true, value: '/memo/hello' })
    expect(normalizeLegacyFilePath('/memo//hello')).toEqual({ ok: true, value: '/memo/hello' })
    expect(normalizeLegacyFilePath('post/hello.md')).toMatchObject({
      ok: false,
      error: { code: 'file_extension' },
    })
  })

  it('blocks active collisions and invalid active Paths while reporting historical evidence', () => {
    const report = auditLegacyFileRows([...blockingLegacyFileRows].reverse())

    expect(report.status).toBe('blocked')
    expect(report.abortReasons).toEqual([
      { code: 'active_path_collision', normalizedPath: '/memo/note', rowIds: [1, 2] },
      { code: 'invalid_active_path', rawPath: 'post/bad.md', rowIds: [5] },
    ])
    expect(report.activeCollisions).toEqual([
      { normalizedPath: '/memo/note', activeIds: [1, 2], recycledIds: [3, 4] },
    ])
    expect(report.activeRecycledDuplicates).toEqual(report.activeCollisions)
    expect(report.recycledDuplicates).toEqual(report.activeCollisions)
    expect(report.invalidPaths).toEqual([
      { id: 5, state: 'active', rawPath: 'post/bad.md', errorCode: 'file_extension' },
    ])
    expect(report.subjectDifferences).toContainEqual({
      id: 1,
      state: 'active',
      normalizedPath: '/memo/note',
      legacySubject: 'Legacy Note',
      derivedTitle: 'note',
    })
  })
})

describe('migration preservation report', () => {
  it('emits a deterministic manifest and retains recycled duplicate projections', () => {
    const report = auditLegacyFileRows(successfulLegacyFileRows)

    expect(report).toEqual(auditLegacyFileRows([...successfulLegacyFileRows].reverse()))
    expect(report.status).toBe('ready')
    expect(report.summary).toEqual({
      totalRows: 5,
      activeRows: 3,
      recycledRows: 2,
      validRows: 5,
      invalidRows: 0,
      privateRows: 1,
      remoteTruthRows: 1,
      sourceCounts: { 10: 3, 20: 1, 30: 1 },
    })
    for (const check of Object.values(report.preservation)) {
      expect(check).toEqual({ rowCount: 5, sha256: expect.stringMatching(/^[a-f0-9]{64}$/) })
    }
    expect(report.projectedRows.filter(row => row.path === '/post/hello')).toEqual([
      { id: 12, path: '/post/hello', title: 'hello', state: 'active' },
      { id: 13, path: '/post/hello', title: 'hello', state: 'recycled' },
      { id: 14, path: '/post/hello', title: 'hello', state: 'recycled' },
    ])
  })

  it('canonicalizes SQLite Date and D1 second timestamps to the same preservation result', () => {
    const sqliteReport = auditLegacyFileRows(successfulLegacyFileRows)
    const d1Rows = successfulLegacyFileRows.map(row => ({
      ...row,
      createdAt: new Date(row.createdAt).getTime() / 1000,
      updatedAt: new Date(row.updatedAt).getTime() / 1000,
      deletedAt: row.deletedAt === null ? null : new Date(row.deletedAt).getTime() / 1000,
      private: Number(Boolean(row.private)),
      remoteTruth: Number(Boolean(row.remoteTruth)),
    }))

    expect(auditLegacyFileRows(d1Rows).preservation).toEqual(sqliteReport.preservation)
  })
})

describe('migration audit interchange', () => {
  it('serializes stable machine-readable and human-readable reports', () => {
    const report = auditLegacyFileRows(successfulLegacyFileRows)
    const json = serializeFileMigrationAudit(report)
    const text = formatFileMigrationAudit(report)

    expect(JSON.parse(json)).toEqual(report)
    expect(json).toBe(serializeFileMigrationAudit(auditLegacyFileRows([...successfulLegacyFileRows].reverse())))
    expect(text).toContain('Status: READY')
    expect(text).toContain('Rows: 5 total, 3 active, 2 recycled')
    expect(text).toContain('Active/recycled duplicate: /post/hello (active: 12; recycled: 13, 14)')
    expect(text).toContain('Subject difference: #13 recycled "Old headline" -> "hello" (/post/hello)')
    expect(text).toMatch(/Preservation ids: 5 rows, sha256 [a-f0-9]{64}/)
  })

  it('accepts direct and Wrangler D1 rows while rejecting malformed snapshots', () => {
    const rawRows = successfulLegacyFileRows.map(row => ({
      ...row,
      createdAt: 1767225600,
      updatedAt: 1767312000,
      deletedAt: row.deletedAt === null ? null : 1769904000,
      private: Number(Boolean(row.private)),
      remoteTruth: Number(Boolean(row.remoteTruth)),
    }))

    expect(parseLegacyFileSnapshot(rawRows)).toEqual(rawRows)
    expect(parseLegacyFileSnapshot([{ success: true, results: rawRows, meta: {} }])).toEqual(rawRows)
    expect(() => parseLegacyFileSnapshot([{ success: false, results: [], error: 'query failed' }])).toThrowError(/unsuccessful/i)
    expect(() => parseLegacyFileSnapshot([{ ...rawRows[0], subject: undefined }])).toThrowError(/row 0.*subject/i)
  })
})
