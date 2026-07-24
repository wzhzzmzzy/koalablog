import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import * as schema from '../../src/db/schema'
import { calculateSourceHash } from '../../src/lib/files/source-hash'
import { DEFAULT_MEMO_TEMPLATE_V2 } from '../../src/lib/files/template'
import { calculateArtifactHashes } from '../../src/lib/svelte/artifact-hash'
import { SVELTE_TOOLCHAIN_VERSIONS, UNOCSS_CONFIG_HASH } from '../../src/lib/svelte/toolchain'

const root = process.cwd()
const dataDirectory = path.join(root, '.playwright')
const databasePath = path.join(dataDirectory, 'local.db')
const configPath = path.join(dataDirectory, 'koala.config.json')

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

function openDatabase() {
  return drizzle({ connection: { url: `file:${databasePath}` }, schema })
}

async function seedDatabase(database: ReturnType<typeof openDatabase>) {
  await database.insert(schema.creationTemplateCatalog).values({
    key: 'koala:creation-templates',
    schemaVersion: 2,
    revision: 1,
    payload: JSON.stringify([DEFAULT_MEMO_TEMPLATE_V2]),
  })
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
    {
      source: 20,
      path: '/svelte-drift',
      title: 'svelte-drift',
      renderer: 'svelte',
      content: '<p>Dependency drift must be reviewed</p>',
      sourceHash: await calculateSourceHash('svelte', '<p>Dependency drift must be reviewed</p>'),
      tags: '',
      incoming_links: '[]',
      outgoing_links: '[]',
    },
  ])

  const svelteFile = await database.query.markdown.findFirst({ where: (markdown, { eq }) => eq(markdown.path, '/svelte-public') })
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

  const driftFile = await database.query.markdown.findFirst({ where: (markdown, { eq }) => eq(markdown.path, '/svelte-drift') })
  if (!driftFile)
    throw new Error('Expected dependency-drift Svelte test File')

  const driftArtifact = {
    ...publicArtifact,
    sourceHash: driftFile.sourceHash,
    dependencies: [{
      url: 'https://example.test/dependency.js',
      bytes: 1,
      sha256: 'b'.repeat(64),
    }],
  }
  const driftHashes = await calculateArtifactHashes(driftArtifact)
  await database.insert(schema.markdownRender).values({ fileId: driftFile.id, ...driftArtifact, ...driftHashes })
}

async function writeFixtureConfig() {
  await writeFile(configPath, JSON.stringify(config), 'utf8')
}

export async function createEditorE2EFixture() {
  await rm(dataDirectory, { recursive: true, force: true })
  await mkdir(dataDirectory, { recursive: true })
  await writeFixtureConfig()
  const database = openDatabase()
  try {
    await migrate(database, { migrationsFolder: path.join(root, 'migrations') })
    await seedDatabase(database)
  }
  finally {
    database.$client.close()
  }
}

export async function resetEditorE2EFixture() {
  await mkdir(dataDirectory, { recursive: true })
  await writeFixtureConfig()
  const database = openDatabase()
  try {
    await database.delete(schema.markdownRender)
    await database.delete(schema.markdown)
    await database.delete(schema.ossAccess)
    await database.delete(schema.creationTemplateCatalog)
    await database.delete(schema.blobStorage)
    await database.run(sql`DELETE FROM sqlite_sequence WHERE name IN ('markdown', 'blob_storage')`)
    await seedDatabase(database)
  }
  finally {
    database.$client.close()
  }
}
