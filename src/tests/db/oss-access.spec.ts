import { randomUUID } from 'node:crypto'
import { unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { incrementToday, readToday } from '@/db/ossAccess'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const testEnv = {} as Env
let databasePath: string

describe('oss access accounting', () => {
  beforeEach(async () => {
    databasePath = join(tmpdir(), `koalablog-oss-access-${randomUUID()}.db`)
    vi.stubEnv('SQLITE_URL', `file:${databasePath}`)

    const database = drizzle({ connection: { url: `file:${databasePath}` } })
    await migrate(database, { migrationsFolder: 'migrations' })
    database.$client.close()
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
