import { fileURLToPath } from 'node:url'
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config'

export default defineWorkersConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    include: ['src/tests-d1/**/*.d1.ts'],
    poolOptions: {
      workers: {
        miniflare: {
          compatibilityDate: '2025-04-01',
          bindings: {
            CF_PAGES: 1,
            DATA_SOURCE: 'd1',
          },
          d1Databases: {
            DB: 'gate-1a-template-catalog-test',
          },
          kvNamespaces: {
            KOALA: 'gate-1a-global-config-test',
          },
        },
      },
    },
  },
})
