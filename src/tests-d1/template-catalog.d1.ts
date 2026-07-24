import { connectD1 } from '@/db'
import { updateGlobalConfig } from '@/lib/kv'
import { defineTemplateCatalogContract } from '@/tests/shared/template-catalog-contract'
import { env } from 'cloudflare:test'
import { sql } from 'drizzle-orm'

import initSql from '../../migrations/0000_init.sql?raw'

defineTemplateCatalogContract({
  name: 'D1',
  env,
  prepare: async () => {
    const db = connectD1(env.DB)
    await db.run(sql.raw('DROP TABLE IF EXISTS creation_template_catalog'))
    const catalogStatement = initSql.split('--> statement-breakpoint')
      .map(statement => statement.trim())
      .find(statement => statement.includes('CREATE TABLE `creation_template_catalog`'))
    if (!catalogStatement)
      throw new Error('Expected creation_template_catalog in the initialization migration')
    await db.run(sql.raw(catalogStatement))
    await env.KOALA.delete('_KoalaConfig_')
  },
  updateUnrelatedSettings: () => updateGlobalConfig(env, {
    pageConfig: { title: 'Unrelated Settings update' },
  }),
})
