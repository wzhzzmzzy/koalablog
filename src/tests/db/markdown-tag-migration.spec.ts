import { randomUUID } from 'node:crypto'
import { readFile, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type Client, createClient } from '@libsql/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

let databasePath = ''
let client: Client

beforeEach(async () => {
  databasePath = join(tmpdir(), `koalablog-markdown-tag-migration-${randomUUID()}.db`)
  client = createClient({ url: `file:${databasePath}` })
  await client.executeMultiple(`
    CREATE TABLE markdown (
      id INTEGER PRIMARY KEY,
      renderer TEXT NOT NULL,
      tags TEXT
    );
    INSERT INTO markdown (id, renderer, tags) VALUES
      (1, 'markdown', 'java, javascript'),
      (2, 'markdown', ' alpha, ,beta,alpha '),
      (3, 'markdown', '["existing"]'),
      (4, 'markdown', '[broken'),
      (5, 'markdown', '{"tag":"x"}'),
      (6, 'markdown', 'true'),
      (7, 'markdown', ''),
      (8, 'markdown', NULL),
      (9, 'svelte', 'legacy,svelte'),
      (10, 'markdown', 'quote"tag,back\\slash');
  `)
})

afterEach(async () => {
  client.close()
  await unlink(databasePath).catch(() => undefined)
})

describe('markdown Tag CSV-to-JSON data migration', () => {
  it('converts only unambiguous Markdown CSV rows and is idempotent', async () => {
    const migration = await readFile('scripts/db/migrate-markdown-tags-to-json.sql', 'utf8')

    await client.executeMultiple(migration)
    const first = await client.execute('SELECT id, tags FROM markdown ORDER BY id')

    expect(first.rows).toEqual([
      { id: 1, tags: '["java","javascript"]' },
      { id: 2, tags: '["alpha","beta","alpha"]' },
      { id: 3, tags: '["existing"]' },
      { id: 4, tags: '[broken' },
      { id: 5, tags: '{"tag":"x"}' },
      { id: 6, tags: 'true' },
      { id: 7, tags: '' },
      { id: 8, tags: null },
      { id: 9, tags: 'legacy,svelte' },
      { id: 10, tags: '["quote\\"tag","back\\\\slash"]' },
    ])

    await client.executeMultiple(migration)
    expect((await client.execute('SELECT id, tags FROM markdown ORDER BY id')).rows).toEqual(first.rows)
  })
})
