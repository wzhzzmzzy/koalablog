import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'
import { createVerifiedSQLiteBackup } from '../../src/db/file-migration'

interface BackupArguments {
  source: string
  backup: string
  rehearsal: string
  manifest: string
  commit: string
  migration: string
  operator: string
  timestamp: string
  maintenanceConfirmed: boolean
}

function usage(): string {
  return 'Usage: pnpm migration:backup:sqlite -- --source <db> --backup <db> --rehearsal <db> --manifest <json> --commit <sha> --migration <version> --operator <name> --timestamp <iso> --maintenance-confirmed'
}

function parseArguments(input: string[]): BackupArguments {
  const maintenanceConfirmed = input.includes('--maintenance-confirmed')
  const positional = input.filter(value => value !== '--maintenance-confirmed')
  const values = new Map<string, string>()
  for (let index = 0; index < positional.length; index += 2) {
    const flag = positional[index]
    const value = positional[index + 1]
    if (!flag?.startsWith('--') || !value)
      throw new Error(usage())
    values.set(flag.slice(2), value)
  }

  const required = ['source', 'backup', 'rehearsal', 'manifest', 'commit', 'migration', 'operator', 'timestamp'] as const
  if (required.some(field => !values.get(field)))
    throw new Error(usage())
  return {
    source: values.get('source')!,
    backup: values.get('backup')!,
    rehearsal: values.get('rehearsal')!,
    manifest: values.get('manifest')!,
    commit: values.get('commit')!,
    migration: values.get('migration')!,
    operator: values.get('operator')!,
    timestamp: values.get('timestamp')!,
    maintenanceConfirmed,
  }
}

async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2))
  const manifest = await createVerifiedSQLiteBackup({
    sourceDatabasePath: options.source,
    backupDatabasePath: options.backup,
    rehearsalDatabasePath: options.rehearsal,
    maintenanceConfirmed: options.maintenanceConfirmed,
    applicationCommit: options.commit,
    migrationVersion: options.migration,
    operator: options.operator,
    operatorTimestamp: options.timestamp,
  })
  const manifestPath = resolve(options.manifest)
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' })
  process.stdout.write(`Verified SQLite backup: ${manifest.backup.path}\nRestore rehearsal: ${manifest.restoreRehearsal.path}\nManifest: ${manifestPath}\n`)
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
