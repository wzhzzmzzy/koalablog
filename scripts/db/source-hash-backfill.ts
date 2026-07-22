import { writeFile } from 'node:fs/promises'
import process from 'node:process'
import { parseSourceHashMaintenanceArguments, verifySQLiteBackupProof } from './source-hash-maintenance-options'
import { runSourceHashMaintenance } from './source-hash-maintenance-runner'
import { createD1SourceHashOperatorStore, createSQLiteSourceHashOperatorStore } from './source-hash-maintenance-target'

async function main(): Promise<void> {
  const options = parseSourceHashMaintenanceArguments(process.argv.slice(2), 'backfill')
  if (options.kind === 'sqlite')
    await verifySQLiteBackupProof(options)
  const store = options.kind === 'sqlite'
    ? createSQLiteSourceHashOperatorStore(options.database)
    : createD1SourceHashOperatorStore(options)

  try {
    const report = await runSourceHashMaintenance(store, {
      target: options.kind === 'sqlite'
        ? {
            kind: 'sqlite',
            database: options.database,
            backupManifest: options.backupManifest,
          }
        : {
            kind: 'd1',
            database: options.database,
            mode: options.mode,
            ...(options.persistTo ? { persistTo: options.persistTo } : {}),
          },
      applicationCommit: options.commit,
      migrationStage: options.migrationStage,
      operator: options.operator,
      operatorTimestamp: options.timestamp,
      batchSize: options.batchSize,
    })
    await writeFile(options.output, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' })
    process.stdout.write(`Source Hash maintenance ${report.status.toUpperCase()}\nReport: ${options.output}\n`)
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
