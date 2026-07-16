import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'
import { readLegacyFileRowsFromSQLite } from '../../src/db/file-migration'
import {
  formatFileMigrationAudit,
  parseLegacyFileSnapshot,
} from '../../src/lib/files/migration-audit'
import { archiveFileMigrationAudit } from '../../src/lib/files/migration-audit-runner'

interface AuditArguments {
  sqlite?: string
  snapshot?: string
  output: string
}

function usage(): string {
  return 'Usage: pnpm migration:audit -- (--sqlite <database> | --snapshot <wrangler.json>) --output <directory>'
}

function parseArguments(input: string[]): AuditArguments {
  const values = new Map<string, string>()
  for (let index = 0; index < input.length; index += 2) {
    const flag = input[index]
    const value = input[index + 1]
    if (!flag?.startsWith('--') || !value)
      throw new Error(usage())
    values.set(flag.slice(2), value)
  }

  const sqlite = values.get('sqlite')
  const snapshot = values.get('snapshot')
  const output = values.get('output')
  if (Boolean(sqlite) === Boolean(snapshot) || !output)
    throw new Error(usage())
  return { sqlite, snapshot, output }
}

async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2))
  const rows = options.sqlite
    ? await readLegacyFileRowsFromSQLite(options.sqlite.startsWith('file:') ? options.sqlite : `file:${resolve(options.sqlite)}`)
    : parseLegacyFileSnapshot(JSON.parse(await readFile(resolve(options.snapshot!), 'utf8')))
  const { report } = await archiveFileMigrationAudit(rows, resolve(options.output))

  process.stdout.write(formatFileMigrationAudit(report))
  if (report.status === 'blocked')
    process.exitCode = 2
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
