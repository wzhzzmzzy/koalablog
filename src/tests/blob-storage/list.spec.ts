import { randomUUID } from 'node:crypto'
import { unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createClient } from '@libsql/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SQLiteBlobStorage } from '@/lib/blob-storage'

const env = {} as Env
let databasePath = ''

describe('sqlite blob storage list', () => {
  beforeEach(async () => {
    databasePath = join(tmpdir(), `koalablog-blob-list-${randomUUID()}.db`)
    vi.stubEnv('SQLITE_URL', `file:${databasePath}`)
    const client = createClient({ url: `file:${databasePath}` })
    await client.executeMultiple(`
      CREATE TABLE blob_storage (
        id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        key text NOT NULL UNIQUE,
        contentType text NOT NULL,
        size integer NOT NULL,
        data text NOT NULL,
        metadata text,
        uploadedAt integer DEFAULT (unixepoch()) NOT NULL,
        updatedAt integer DEFAULT (unixepoch()) NOT NULL
      );
    `)
    client.close()
  })

  afterEach(async () => {
    vi.unstubAllEnvs()
    await unlink(databasePath).catch(() => undefined)
  })

  it('applies prefix and cursor while paginating in key order', async () => {
    const storage = new SQLiteBlobStorage(env)
    await Promise.all([
      storage.put('other/global.png', 'global'),
      storage.put('sync-attachments/1/a.png', 'a'),
      storage.put('sync-attachments/1/b.png', 'bb'),
      storage.put('sync-attachments/1/c.png', 'ccc'),
      storage.put('sync-attachments/2/d.png', 'dddd'),
    ])

    const first = await storage.list({ prefix: 'sync-attachments/1/', limit: 2 })
    expect(first.objects.map(object => object.key)).toEqual([
      'sync-attachments/1/a.png',
      'sync-attachments/1/b.png',
    ])
    expect(first).toMatchObject({ truncated: true, cursor: 'sync-attachments/1/b.png' })

    const second = await storage.list({ prefix: 'sync-attachments/1/', limit: 2, cursor: first.cursor })
    expect(second.objects.map(object => object.key)).toEqual(['sync-attachments/1/c.png'])
    expect(second.truncated).toBe(false)
  })
})
