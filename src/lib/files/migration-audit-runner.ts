import type { FileMigrationAuditReport, LegacyFileRow } from './migration-audit'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  auditLegacyFileRows,
  formatFileMigrationAudit,
  serializeFileMigrationAudit,
} from './migration-audit'

export const FILE_MIGRATION_AUDIT_JSON = 'file-migration-audit.v1.json'
export const FILE_MIGRATION_AUDIT_TEXT = 'file-migration-audit.v1.txt'

export async function archiveFileMigrationAudit(
  rows: LegacyFileRow[],
  outputDirectory: string,
): Promise<{
    report: FileMigrationAuditReport
    jsonPath: string
    textPath: string
  }> {
  const report = auditLegacyFileRows(rows)
  const jsonPath = join(outputDirectory, FILE_MIGRATION_AUDIT_JSON)
  const textPath = join(outputDirectory, FILE_MIGRATION_AUDIT_TEXT)

  await mkdir(outputDirectory, { recursive: true })
  await Promise.all([
    writeFile(jsonPath, serializeFileMigrationAudit(report), { flag: 'wx' }),
    writeFile(textPath, formatFileMigrationAudit(report), { flag: 'wx' }),
  ])

  return { report, jsonPath, textPath }
}
