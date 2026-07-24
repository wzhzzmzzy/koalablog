import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import * as schema from '../../src/db/schema'
import { calculateSourceHash } from '../../src/lib/files/source-hash'
import { calculateArtifactHashes } from '../../src/lib/svelte/artifact-hash'
import { SVELTE_TOOLCHAIN_VERSIONS, UNOCSS_CONFIG_HASH } from '../../src/lib/svelte/toolchain'

const root = process.cwd()
const dataDirectory = path.join(root, '.playwright')
const databasePath = path.join(dataDirectory, 'local.db')
const configPath = path.join(dataDirectory, 'koala.config.json')

await rm(dataDirectory, { recursive: true, force: true })
await mkdir(dataDirectory, { recursive: true })

const config = {
  _KoalaConfig_: {
    pageConfig: { title: 'Koalablog Playwright' },
    rss: {},
    font: {},
    auth: {
      adminKey: 'koalablog-playwright-admin',
      bearerToken: 'koalablog-playwright',
    },
    oss: { operateLimit: 1000, readLimit: 1000 },
    _runtime: { ready: true },
  },
}
await writeFile(configPath, JSON.stringify(config), 'utf8')

const database = drizzle({ connection: { url: `file:${databasePath}` }, schema })
await migrate(database, { migrationsFolder: path.join(root, 'migrations') })
await database.insert(schema.markdown).values([
  {
    source: 20,
    path: '/phase-two',
    title: 'phase-two',
    content: 'First line\nSecond line',
    sourceHash: await calculateSourceHash('markdown', 'First line\nSecond line'),
    tags: '',
    incoming_links: '[]',
    outgoing_links: '[]',
  },
  {
    source: 20,
    path: '/trashed',
    title: 'trashed',
    content: 'Read-only Source',
    sourceHash: await calculateSourceHash('markdown', 'Read-only Source'),
    tags: '',
    incoming_links: '[]',
    outgoing_links: '[]',
    deletedAt: new Date(),
  },
  {
    source: 20,
    path: '/second',
    title: 'second',
    content: 'Second file',
    sourceHash: await calculateSourceHash('markdown', 'Second file'),
    tags: '',
    incoming_links: '[]',
    outgoing_links: '[]',
  },
  {
    source: 20,
    path: '/trashed-second',
    title: 'trashed-second',
    content: 'Second read-only Source',
    sourceHash: await calculateSourceHash('markdown', 'Second read-only Source'),
    tags: '',
    incoming_links: '[]',
    outgoing_links: '[]',
    deletedAt: new Date(),
  },
  {
    source: 20,
    path: '/svelte-public',
    title: 'svelte-public',
    renderer: 'svelte',
    content: '<p>Source must not render</p>',
    sourceHash: await calculateSourceHash('svelte', '<p>Source must not render</p>'),
    tags: '',
    incoming_links: '[]',
    outgoing_links: '[]',
  },
])

const [svelteFile] = await database.select().from(schema.markdown).where(eq(schema.markdown.path, '/svelte-public'))
if (!svelteFile)
  throw new Error('Expected public Svelte test File')

const publicArtifact = {
  schemaVersion: 1 as const,
  renderer: 'svelte' as const,
  svelteVersion: SVELTE_TOOLCHAIN_VERSIONS.svelte,
  unocssVersion: SVELTE_TOOLCHAIN_VERSIONS.unocss,
  unocssConfigHash: UNOCSS_CONFIG_HASH,
  sourceHash: svelteFile.sourceHash,
  dependencies: [],
  javascript: '({ mount(target) { target.innerHTML = \'<p id="live-artifact">Live Artifact</p>\'; return {}; }, unmount() {} })',
  css: ':where([data-koala-artifact-root]) .snapshot { color: rgb(1, 2, 3); }',
  snapshotHtml: '<p class="snapshot">Snapshot Artifact</p><a href="/phase-two">Safe link</a>',
}
const hashes = await calculateArtifactHashes(publicArtifact)
await database.insert(schema.markdownRender).values({ fileId: svelteFile.id, ...publicArtifact, ...hashes })
database.$client.close()
