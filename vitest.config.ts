import path from 'node:path'
import { defineWorkersProject, readD1Migrations } from '@cloudflare/vitest-pool-workers/config'
/// <reference types="vitest" />
import { getViteConfig } from 'astro/config'

export default defineWorkersProject(async () => {
  const migrationsPath = path.join(__dirname, 'migrations')
  const migrations = await readD1Migrations(migrationsPath)
  return {
    test: {
      setupFiles: ['./test/apply-migrations.ts'],
      poolOptions: {
        workers: {
          wrangler: { configPath: './wrangler.toml' },
          miniflare: {
            bindings: { TEST_MIGRATIONS: migrations },
            kvNamespaces: ['KOALA'],
            d1Database: ['DB'],
          },
        },
      },
    },
  }
})
