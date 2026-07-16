import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'
import { migrateSQLiteFileSourceSchema } from '../../src/db/file-migration'
import { formatFileMigrationAudit } from '../../src/lib/files/migration-audit'
import { parseCliArguments } from './cli-arguments'

function usage() {
  return 'Usage: pnpm migration:files:sqlite -- --sqlite <database> --maintenance-confirmed'
}

async function main() {
  const { values, flags } = parseCliArguments(process.argv.slice(2), {
    valueFlags: ['sqlite'],
    booleanFlags: ['maintenance-confirmed'],
    usage: usage(),
  })
  const databasePath = values.get('sqlite')
  if (!databasePath || !flags.has('maintenance-confirmed'))
    throw new Error(usage())

  const sqliteUrl = databasePath.startsWith('file:') ? databasePath : `file:${resolve(databasePath)}`
  const migration = await readFile(resolve('migrations/0002_file_source_schema.sql'), 'utf8')
  const result = await migrateSQLiteFileSourceSchema(sqliteUrl, migration)
  if (result.status === 'blocked') {
    process.stdout.write(formatFileMigrationAudit(result.audit))
    process.exitCode = 2
    return
  }

  process.stdout.write(`Gate 1C File Source migration completed: ${result.rowCount} rows\n`)
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
