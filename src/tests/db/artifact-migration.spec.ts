import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { artifactSchemaStatus, migrateArtifactSchema } from '@/db/artifact-migration'

let directory = ''

afterEach(async () => {
  vi.unstubAllEnvs()
  if (directory)
    await rm(directory, { recursive: true, force: true })
})

describe('settings database migration on SQLite', () => {
  it('migrates an existing installation, records the CLI migration and is safely repeatable', async () => {
    directory = await mkdtemp(join(tmpdir(), `koala-artifact-${randomUUID()}-`))
    const folder = join(directory, 'migrations')
    await mkdir(join(folder, 'meta'), { recursive: true })
    const journal = JSON.parse(await readFile('migrations/meta/_journal.json', 'utf8'))
    journal.entries = journal.entries.slice(0, 3)
    await writeFile(join(folder, 'meta/_journal.json'), JSON.stringify(journal))
    for (const entry of journal.entries)
      await writeFile(join(folder, `${entry.tag}.sql`), await readFile(`migrations/${entry.tag}.sql`))
    const url = `file:${join(directory, 'database.db')}`
    vi.stubEnv('SQLITE_URL', url)
    const db = drizzle({ connection: { url } })
    try {
      await migrate(db, { migrationsFolder: folder })
      expect(await artifactSchemaStatus({} as Env)).toMatchObject({ ready: false })
      expect(await migrateArtifactSchema({} as Env)).toMatchObject({ ready: true })
      await migrateArtifactSchema({} as Env)
      await migrate(db, { migrationsFolder: 'migrations' })
      const rows = await db.$client.execute('SELECT * FROM __drizzle_migrations')
      expect(rows.rows).toHaveLength(4)
      expect((await artifactSchemaStatus({} as Env)).columns).not.toContain('snapshotHtml')
    }
    finally {
      db.$client.close()
    }
  })
})
