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

import catalogMigration from '../../../migrations/0001_creation_template_catalog.sql?raw'

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
    await connectDB(testEnv).run(sql.raw(catalogMigration))
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
