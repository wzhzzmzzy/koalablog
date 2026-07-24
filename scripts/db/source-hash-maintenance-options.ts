import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseCliArguments } from './cli-arguments'

interface CommonArguments {
  output: string
  commit: string
  migrationStage: string
  operator: string
  timestamp: string
  batchSize: number
}

export type SourceHashMaintenanceArguments = CommonArguments & ({
  kind: 'sqlite'
  database: string
  backupManifest: string
} | {
  kind: 'd1'
  database: string
  mode: 'local' | 'remote'
  persistTo?: string
})

function usage(command: 'backfill' | 'audit'): string {
  return `Usage: pnpm source-hash:${command} -- (--sqlite <database> --backup-manifest <json> | --d1 <database> (--local --persist-to <directory> | --remote --authorize-remote <database>)) --output <json> --commit <sha> --migration-stage <version> --operator <name> --timestamp <iso> --batch-size <1-500> --maintenance-confirmed`
}

export function parseSourceHashMaintenanceArguments(
  input: string[],
  command: 'backfill' | 'audit',
): SourceHashMaintenanceArguments {
  const usageText = usage(command)
  const { values, flags } = parseCliArguments(input, {
    valueFlags: [
      'sqlite',
      'd1',
      'backup-manifest',
      'persist-to',
      'authorize-remote',
      'output',
      'commit',
      'migration-stage',
      'operator',
      'timestamp',
      'batch-size',
    ],
    booleanFlags: ['local', 'remote', 'maintenance-confirmed'],
    usage: usageText,
  })
  const required = [
    'output',
    'commit',
    'migration-stage',
    'operator',
    'timestamp',
    'batch-size',
  ] as const
  if (required.some(field => !values.get(field)) || !flags.has('maintenance-confirmed'))
    throw new Error(usageText)

  const batchSize = Number(values.get('batch-size'))
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 500)
    throw new Error('Source Hash maintenance --batch-size must be an integer between 1 and 500')
  const timestamp = values.get('timestamp')!
  if (Number.isNaN(new Date(timestamp).getTime()))
    throw new Error('Source Hash maintenance --timestamp must be a valid timestamp')
  const common: CommonArguments = {
    output: resolve(values.get('output')!),
    commit: values.get('commit')!,
    migrationStage: values.get('migration-stage')!,
    operator: values.get('operator')!,
    timestamp,
    batchSize,
  }

  const sqlite = values.get('sqlite')
  const d1 = values.get('d1')
  if (Boolean(sqlite) === Boolean(d1))
    throw new Error(usageText)
  if (sqlite && !values.get('backup-manifest'))
    throw new Error(usageText)
  if (sqlite) {
    return {
      ...common,
      kind: 'sqlite',
      database: resolve(sqlite),
      backupManifest: resolve(values.get('backup-manifest')!),
    }
  }

  const local = flags.has('local')
  const remote = flags.has('remote')
  if (local === remote)
    throw new Error(usageText)
  if (local && !values.get('persist-to'))
    throw new Error('Local D1 maintenance requires an explicit --persist-to directory')
  if (remote && values.get('authorize-remote') !== d1)
    throw new Error(`Remote D1 maintenance requires --authorize-remote ${d1}`)

  return {
    ...common,
    kind: 'd1',
    database: d1!,
    mode: local ? 'local' : 'remote',
    ...(local ? { persistTo: resolve(values.get('persist-to')!) } : {}),
  }
}

function objectValue(input: unknown, field: string): Record<string, unknown> {
  if (!input || typeof input !== 'object')
    throw new Error(`SQLite backup manifest ${field} must be an object`)
  return input as Record<string, unknown>
}

function stringValue(input: Record<string, unknown>, field: string): string {
  if (typeof input[field] !== 'string' || input[field].length === 0)
    throw new Error(`SQLite backup manifest ${field} must be a non-empty string`)
  return input[field]
}

async function fileHash(path: string): Promise<string> {
  return createHash('sha256').update(await readFile(path)).digest('hex')
}

export async function verifySQLiteBackupProof(
  options: Extract<SourceHashMaintenanceArguments, { kind: 'sqlite' }>,
): Promise<void> {
  const manifest = objectValue(JSON.parse(await readFile(options.backupManifest, 'utf8')), 'root')
  if (manifest.schemaVersion !== 1
    || manifest.databaseKind !== 'sqlite'
    || manifest.verified !== true
    || manifest.maintenanceConfirmed !== true) {
    throw new Error('SQLite backup manifest is not a verified maintenance proof')
  }
  if (manifest.applicationCommit !== options.commit)
    throw new Error('SQLite backup manifest application commit does not match --commit')

  const source = objectValue(manifest.source, 'source')
  const backup = objectValue(manifest.backup, 'backup')
  const rehearsal = objectValue(manifest.restoreRehearsal, 'restoreRehearsal')
  if (resolve(stringValue(source, 'path')) !== options.database)
    throw new Error('SQLite backup manifest source path does not match --sqlite')

  const backupPath = resolve(stringValue(backup, 'path'))
  const rehearsalPath = resolve(stringValue(rehearsal, 'path'))
  const [actualBackupHash, actualRehearsalHash] = await Promise.all([
    fileHash(backupPath),
    fileHash(rehearsalPath),
  ])
  if (actualBackupHash !== stringValue(backup, 'sha256')
    || actualRehearsalHash !== stringValue(rehearsal, 'sha256')
    || actualBackupHash !== actualRehearsalHash) {
    throw new Error('SQLite backup manifest files no longer match the verified backup proof')
  }
}
