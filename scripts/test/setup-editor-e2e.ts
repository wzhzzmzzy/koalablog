import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { createClient } from '@libsql/client'

const root = process.cwd()
const dataDirectory = path.join(root, '.playwright')
const databasePath = path.join(dataDirectory, 'local.db')
const configPath = path.join(dataDirectory, 'koala.config.json')

await rm(dataDirectory, { recursive: true, force: true })
await mkdir(dataDirectory, { recursive: true })

const config = {
  _KoalaConfig_: {
    pageConfig: { title: 'Koalablog Playwright' },
    rss: {},
    font: {},
    auth: {
      adminKey: 'koalablog-playwright-admin',
      bearerToken: 'koalablog-playwright',
    },
    oss: { operateLimit: 1000, readLimit: 1000 },
    _runtime: { ready: true },
  },
}
await writeFile(configPath, JSON.stringify(config), 'utf8')

const client = createClient({ url: `file:${databasePath}` })
for (const migration of [
  'migrations/0000_init.sql',
  'migrations/0001_creation_template_catalog.sql',
  'migrations/0002_file_source_schema.sql',
]) {
  const sql = await readFile(path.join(root, migration), 'utf8')
  for (const statement of sql.split('--> statement-breakpoint')) {
    if (statement.trim())
      await client.executeMultiple(statement)
  }
}

await client.execute({
  sql: `INSERT INTO markdown (
    source, path, title, content, tags, incoming_links, outgoing_links,
    private, remoteTruth, revision
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  args: [20, '/phase-two', 'phase-two', 'First line\nSecond line', '', '[]', '[]', 0, 0, 1],
})
await client.execute({
  sql: `INSERT INTO markdown (
    source, path, title, content, tags, incoming_links, outgoing_links,
    private, remoteTruth, revision, deletedAt
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())`,
  args: [20, '/trashed', 'trashed', 'Read-only Source', '', '[]', '[]', 0, 0, 1],
})
await client.execute({
  sql: `INSERT INTO markdown (
    source, path, title, content, tags, incoming_links, outgoing_links,
    private, remoteTruth, revision
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  args: [20, '/second', 'second', 'Second file', '', '[]', '[]', 0, 0, 1],
})
await client.execute({
  sql: `INSERT INTO markdown (
    source, path, title, content, tags, incoming_links, outgoing_links,
    private, remoteTruth, revision, deletedAt
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())`,
  args: [20, '/trashed-second', 'trashed-second', 'Second read-only Source', '', '[]', '[]', 0, 0, 1],
})
client.close()
