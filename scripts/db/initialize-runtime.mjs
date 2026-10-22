import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { createServer } from 'vite'

const { values } = parseArgs({
  options: {
    sqlite: { type: 'boolean' },
    d1: { type: 'boolean' },
    config: { type: 'string' },
    remote: { type: 'boolean' },
  },
})
if (Boolean(values.sqlite) === Boolean(values.d1))
  throw new Error('Select exactly one of --sqlite or --d1')
if (values.sqlite && (values.config || values.remote))
  throw new Error('--config and --remote apply only to --d1')
if (values.sqlite && (!process.env.SQLITE_URL || !process.env.KOALA_CONFIG_PATH))
  throw new Error('--sqlite requires explicit SQLITE_URL and KOALA_CONFIG_PATH')
if (values.d1 && !values.config)
  throw new Error('--d1 requires an explicit --config path')

const root = fileURLToPath(new URL('../../', import.meta.url))
let platform
let server
try {
  if (values.d1) {
    const { getPlatformProxy } = await import('wrangler')
    platform = await getPlatformProxy({ configPath: values.config, remoteBindings: Boolean(values.remote) })
    if (!platform.env.DB || !platform.env.KOALA)
      throw new Error('The selected configuration must bind DB and KOALA')
  }
  server = await createServer({
    root,
    configFile: false,
    envFile: false,
    appType: 'custom',
    server: { middlewareMode: true, hmr: false },
    resolve: { alias: { '@': fileURLToPath(new URL('../../src', import.meta.url)) } },
    define: {
      'import.meta.env.DATA_SOURCE': JSON.stringify(values.d1 ? 'd1' : 'sqlite'),
      'import.meta.env.SQLITE_URL': JSON.stringify(process.env.SQLITE_URL ?? ''),
    },
  })
  const { initializeExistingInstallation } = await server.ssrLoadModule('/src/db/installation.ts')
  await initializeExistingInstallation(values.d1 ? { ...platform.env, CF_PAGES: 1, DATA_SOURCE: 'd1' } : {})
  process.stdout.write('Existing installation initialization complete. No application deployment was performed.\n')
}
finally {
  await server?.close()
  await platform?.dispose()
}
