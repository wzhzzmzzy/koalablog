import { randomUUID } from 'node:crypto'
import { unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createClient } from '@libsql/client'
import { vi } from 'vitest'
import { defineMetadataReadContract } from '@/tests/shared/metadata-read-contract'
import initSql from '../../../migrations/0000_init.sql?raw'
import userSchemaSql from '../../../migrations/0002_user.sql?raw'

let databasePath: string

defineMetadataReadContract({
  name: 'SQLite',
  env: {} as Env,
  prepare: async () => {
    databasePath = join(tmpdir(), `koalablog-metadata-${randomUUID()}.db`)
    vi.stubEnv('SQLITE_URL', `file:${databasePath}`)
    const client = createClient({ url: `file:${databasePath}` })
    await client.executeMultiple(`${initSql}\n${userSchemaSql}`)
    client.close()
  },
  cleanup: async () => {
    vi.unstubAllEnvs()
    await unlink(databasePath)
  },
})
