import { connectD1 } from '@/db'
import { updateGlobalConfig } from '@/lib/kv'
import { defineTemplateCatalogContract } from '@/tests/shared/template-catalog-contract'
import { env } from 'cloudflare:test'
import { sql } from 'drizzle-orm'

import catalogMigration from '../../migrations/0001_creation_template_catalog.sql?raw'

defineTemplateCatalogContract({
  name: 'D1',
  env,
  prepare: async () => {
    const db = connectD1(env.DB)
    await db.run(sql.raw('DROP TABLE IF EXISTS creation_template_catalog'))
    await db.run(sql.raw(catalogMigration))
    await env.KOALA.delete('_KoalaConfig_')
  },
  updateUnrelatedSettings: () => updateGlobalConfig(env, {
    pageConfig: { title: 'Unrelated Settings update' },
  }),
})
