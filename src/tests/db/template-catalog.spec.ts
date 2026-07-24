import { randomUUID } from 'node:crypto'
import { unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { connectDB } from '@/db'
import { updateGlobalConfig } from '@/lib/kv'
import { createKvStore } from '@/lib/kv/local'
import { defineTemplateCatalogContract } from '@/tests/shared/template-catalog-contract'
import { sql } from 'drizzle-orm'
import { vi } from 'vitest'

import initSql from '../../../migrations/0000_init.sql?raw'

const testEnv = {} as Env
let databasePath = ''
let configPath = ''

defineTemplateCatalogContract({
  name: 'SQLite',
  env: testEnv,
  prepare: async () => {
    databasePath = join(tmpdir(), `koalablog-template-catalog-${randomUUID()}.db`)
    configPath = join(tmpdir(), `koalablog-template-catalog-${randomUUID()}.json`)
    vi.stubEnv('SQLITE_URL', `file:${databasePath}`)
    for (const statement of initSql.split('--> statement-breakpoint').map(value => value.trim()).filter(Boolean))
      await connectDB(testEnv).run(sql.raw(statement))
  },
  cleanup: async () => {
    vi.unstubAllEnvs()
    await Promise.all([
      unlink(databasePath).catch(() => undefined),
      unlink(configPath).catch(() => undefined),
    ])
  },
  updateUnrelatedSettings: () => updateGlobalConfig(testEnv, {
    pageConfig: { title: 'Unrelated Settings update' },
  }, createKvStore(configPath)),
})
