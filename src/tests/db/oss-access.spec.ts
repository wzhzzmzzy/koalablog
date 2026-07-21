import { randomUUID } from 'node:crypto'
import { unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { incrementToday, readToday } from '@/db/ossAccess'
import { createClient } from '@libsql/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const testEnv = {} as Env
let databasePath: string

describe('oss access accounting', () => {
  beforeEach(async () => {
    databasePath = join(tmpdir(), `koalablog-oss-access-${randomUUID()}.db`)
    vi.stubEnv('SQLITE_URL', `file:${databasePath}`)

    const client = createClient({ url: `file:${databasePath}` })
    await client.executeMultiple(`
      CREATE TABLE oss_access (
        id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        date text NOT NULL,
        readTimes integer DEFAULT 0,
        operateTimes integer DEFAULT 0
      );
      CREATE UNIQUE INDEX oss_access_date_unique ON oss_access (date);
    `)
    client.close()
  })

  afterEach(async () => {
    vi.unstubAllEnvs()
    await unlink(databasePath).catch(() => undefined)
  })

  it('counts concurrent operations without racing the daily row creation', async () => {
    await Promise.all(Array.from({ length: 4 }, () => incrementToday(testEnv, 100, 'operate')))

    await expect(readToday(testEnv)).resolves.toMatchObject({ operateTimes: 4 })
  })
})
