import { writeFile } from 'node:fs/promises'
import process from 'node:process'
import { runStoredSourceHashAudit } from '../../src/db/source-hash-maintenance'
import { parseSourceHashMaintenanceArguments, verifySQLiteBackupProof } from './source-hash-maintenance-options'
import { createD1SourceHashOperatorStore, createSQLiteSourceHashOperatorStore } from './source-hash-maintenance-target'

async function main(): Promise<void> {
  const options = parseSourceHashMaintenanceArguments(process.argv.slice(2), 'audit')
  if (options.kind === 'sqlite')
    await verifySQLiteBackupProof(options)
  const store = options.kind === 'sqlite'
    ? createSQLiteSourceHashOperatorStore(options.database)
    : createD1SourceHashOperatorStore(options)

  try {
    const audit = await runStoredSourceHashAudit(store, options.batchSize)
    const report = {
      schemaVersion: 1 as const,
      status: audit.status,
      target: options.kind === 'sqlite'
        ? {
            kind: 'sqlite' as const,
            database: options.database,
            backupManifest: options.backupManifest,
          }
        : {
            kind: 'd1' as const,
            database: options.database,
            mode: options.mode,
            ...(options.persistTo ? { persistTo: options.persistTo } : {}),
          },
      applicationCommit: options.commit,
      migrationStage: options.migrationStage,
      operator: options.operator,
      operatorTimestamp: new Date(options.timestamp).toISOString(),
      maintenanceConfirmed: true as const,
      audit,
    }
    await writeFile(options.output, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' })
    process.stdout.write(`Source Hash audit ${report.status.toUpperCase()}\nReport: ${options.output}\n`)
    if (report.status === 'blocked')
      process.exitCode = 2
  }
  finally {
    store.close()
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
