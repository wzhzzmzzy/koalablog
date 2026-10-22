import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { connectDB } from '@/db'
import { artifactSchemaStatus, migrateArtifactSchema } from '@/db/artifact-migration'
import { listArtifactStorage, transferArtifactStorage } from '@/db/artifact-transfer'
import { purge, restore, trash } from '@/db/markdown'
import { resetD1ForOnboarding } from '@/db/onboarding'
import { readRenderArtifact, replaceDeployedRenderArtifact, replaceRenderArtifact } from '@/db/render-artifact'
import { markdown } from '@/db/schema'
import { calculateArtifactHashes, serializeJavascriptResource } from '@/lib/svelte/artifact-hash'
import { artifactObjectKey } from '@/lib/svelte/artifact-storage'
import { GET as getModule } from '@/pages/api/render-artifacts/[fileId]/[sourceHash]/module.js'
import { GET as getStyles } from '@/pages/api/render-artifacts/[fileId]/[sourceHash]/styles.css'
import initSql from '../../migrations/0000_init.sql?raw'
import userSql from '../../migrations/0002_user.sql?raw'

const sourceHash = 'a'.repeat(64)
const input = {
  fileId: 1,
  schemaVersion: 2 as const,
  renderer: 'svelte' as const,
  svelteVersion: '5',
  unocssVersion: '65',
  unocssConfigHash: 'c'.repeat(64),
  sourceHash,
  dependencies: [],
  javascript: '({ mount(target) { target.textContent = "🐨" }, unmount() {} })',
  css: '',
}

async function artifact() {
  return { ...input, ...await calculateArtifactHashes(input) }
}

async function seed() {
  await migrateArtifactSchema(env)
  const stored = await artifact()
  await replaceRenderArtifact(env, stored)
  return stored
}

function transfer(artifactHash: string, from: 'd1' | 'r2', to: 'd1' | 'r2', ownerId = 7) {
  return transferArtifactStorage(env, { fileId: 1, ownerId, artifactHash, from, to })
}

function context(environment: Env = env, userId: number | null = null, ifNoneMatch = '') {
  return {
    params: { fileId: '1', sourceHash },
    request: new Request('https://koala.test/resource', { headers: { 'If-None-Match': ifNoneMatch } }),
    locals: { runtime: { env: environment }, session: { userId } },
  } as any
}

describe('D1 / R2 Artifact storage and migration', () => {
  beforeEach(async () => {
    await resetD1ForOnboarding(env, [initSql, userSql])
    await connectDB(env).insert(markdown).values({
      id: 1,
      path: '/app',
      title: 'app',
      source: 30,
      renderer: 'svelte',
      content: '<p>Source remains in D1</p>',
      sourceHash,
      userId: 7,
      revision: 11,
    })
  })

  it('removes every stored snapshot without changing Source, revisions, resources or deployed identity', async () => {
    const stored = await artifact()
    await env.DB.prepare(`INSERT INTO markdown_render
      (fileId, schemaVersion, renderer, svelteVersion, unocssVersion, unocssConfigHash, sourceHash,
       dependencies, artifactHash, javascriptResourceHash, cssResourceHash, javascript, css, snapshotHtml)
      VALUES (1, 1, 'svelte', '5', '65', ?, ?, '[]', ?, ?, ?, ?, '', '<p>old snapshot</p>')`)
      .bind(input.unocssConfigHash, sourceHash, stored.artifactHash, stored.javascriptResourceHash, stored.cssResourceHash, stored.javascript)
      .run()
    const before = await env.DB.prepare('SELECT * FROM markdown').first()
    expect(await artifactSchemaStatus(env)).toMatchObject({ ready: false })
    expect(await (await getModule(context())).text()).toBe(serializeJavascriptResource(input.javascript))
    await trash(env, 1)
    const trashed = await env.DB.prepare('SELECT * FROM markdown').first()
    expect(await migrateArtifactSchema(env)).toMatchObject({ ready: true })
    expect(await env.DB.prepare('SELECT * FROM markdown').first()).toEqual(trashed)
    expect(await readRenderArtifact(env, 1)).toMatchObject(stored)
    expect((await artifactSchemaStatus(env)).columns).not.toContain('snapshotHtml')
    await migrateArtifactSchema(env)
    expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM d1_migrations WHERE name = \'0003_artifact_objects.sql\'').first()).toEqual({ count: 1 })
    await restore(env, 1)
    const restored = await env.DB.prepare('SELECT content, sourceHash FROM markdown').first()
    expect(restored).toEqual({ content: before!.content, sourceHash: before!.sourceHash })
  })

  it('round-trips exact module and empty CSS bytes while keeping hashes, timestamps and File revisions', async () => {
    const stored = await seed()
    const before = await readRenderArtifact(env, 1)
    const fileBefore = await env.DB.prepare('SELECT * FROM markdown').first()
    expect(await transfer(stored.artifactHash, 'd1', 'r2')).toEqual({ status: 'migrated' })
    const moved = await readRenderArtifact(env, 1)
    expect(moved).toMatchObject({ javascript: '', css: '', javascriptKey: artifactObjectKey(1, stored.javascriptResourceHash, 'javascript'), cssKey: artifactObjectKey(1, stored.cssResourceHash, 'css') })
    expect(await (await getModule(context())).text()).toBe(serializeJavascriptResource(input.javascript))
    expect(await (await getStyles(context())).text()).toBe('')
    expect(await transfer(stored.artifactHash, 'r2', 'd1')).toEqual({ status: 'migrated' })
    expect(await readRenderArtifact(env, 1)).toEqual(before)
    expect(await env.DB.prepare('SELECT * FROM markdown').first()).toEqual(fileBefore)
  })

  it('checks only schema metadata and lists undeployed, deployed and recycled Owner pages without bodies', async () => {
    const prepare = vi.spyOn(env.DB, 'prepare')
    expect(await artifactSchemaStatus(env)).toMatchObject({ ready: false })
    expect(prepare.mock.calls.map(call => call[0])).toEqual(['PRAGMA table_info(markdown_render)'])
    prepare.mockClear()
    expect(await listArtifactStorage(env, 7, 0, false)).toMatchObject([{ fileId: 1, mode: null, artifactHash: null }])
    expect(prepare.mock.calls.map(call => call[0]).join(' ')).not.toMatch(/"content"|"javascript"|"css"|snapshotHtml|javascriptKey/)
    prepare.mockRestore()
    const stored = await seed()
    await env.DB.prepare('UPDATE markdown SET sourceHash = ? WHERE id = 1').bind('b'.repeat(64)).run()
    await trash(env, 1)
    const [entry] = await listArtifactStorage(env, 7, 0, true, 1)
    expect(entry).toMatchObject({ artifactHash: stored.artifactHash, sourceHash: 'b'.repeat(64), deployedSourceHash: sourceHash, mode: 'd1' })
    expect(entry.deletedAt).not.toBeNull()
    expect(entry).not.toHaveProperty('content')
    expect(entry).not.toHaveProperty('javascript')
    expect(await listArtifactStorage(env, 8, 0, true, 1)).toEqual([])
    expect(await listArtifactStorage(env, 7, 1)).toEqual([])
  })

  it('paginates Svelte-only metadata without skipping or repeating pages', async () => {
    await migrateArtifactSchema(env)
    const rows = Array.from({ length: 51 }, (_, index) => ({
      id: index + 2,
      path: `/app-${index}`,
      title: 'app',
      source: 30,
      renderer: 'svelte' as const,
      content: '',
      sourceHash,
      userId: 7,
    }))
    for (const row of rows) await connectDB(env).insert(markdown).values(row)
    await connectDB(env).insert(markdown).values({ ...rows[0], id: 100, path: '/markdown', renderer: 'markdown' })
    const first = await listArtifactStorage(env, 7)
    const second = await listArtifactStorage(env, 7, first.at(-1)!.fileId)
    expect(first).toHaveLength(50)
    expect(second.map(entry => entry.fileId)).toEqual([51, 52])
  })

  it('uses no R2 reads for denied requests or matching public 304 validators', async () => {
    const stored = await seed()
    await transfer(stored.artifactHash, 'd1', 'r2')
    const get = vi.fn(() => {
      throw new Error('body must not be read')
    })
    const environment = { ...env, OSS: { get } } as unknown as Env
    expect((await getModule(context(environment, null, '*'))).status).toBe(304)
    await env.DB.prepare('UPDATE markdown SET private = 1').run()
    expect((await getModule(context(environment, 8, '*'))).status).toBe(404)
    expect(get).not.toHaveBeenCalled()
    const owned = await getModule(context(env, 7, '*'))
    expect(owned.status).toBe(200)
    expect(owned.headers.get('Cache-Control')).toBe('private, no-store')
    expect(owned.headers.get('ETag')).toBeNull()
    expect(await owned.text()).toBe(serializeJavascriptResource(input.javascript))
  })

  it('fails closed when visibility changes during the R2 read', async () => {
    const stored = await seed()
    await transfer(stored.artifactHash, 'd1', 'r2')
    const environment = { ...env, OSS: { get: async (key: string) => {
      const object = await env.OSS.get(key)
      await env.DB.prepare('UPDATE markdown SET private = 1').run()
      return object
    } } } as unknown as Env
    expect((await getModule(context(environment))).status).toBe(404)
  })

  it('returns uncached 503 for missing R2 bytes instead of serving empty or stale inline content', async () => {
    const stored = await seed()
    await transfer(stored.artifactHash, 'd1', 'r2')
    await env.OSS.delete(artifactObjectKey(1, stored.javascriptResourceHash, 'javascript'))
    const response = await getModule(context())
    expect(response.status).toBe(503)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(await response.text()).toBe('')
    await expect(transfer(stored.artifactHash, 'r2', 'd1')).rejects.toThrow('missing')
    expect((await readRenderArtifact(env, 1))?.javascriptKey).not.toBeNull()
  })

  it('retains the prior deployment on upload failure and on Source CAS conflict', async () => {
    const stored = await seed()
    const before = await readRenderArtifact(env, 1)
    const environment = { ...env, OSS: { put: async () => {
      throw new Error('R2 down')
    } } } as unknown as Env
    await expect(replaceDeployedRenderArtifact(environment, stored, stored.artifactHash, { storage: 'r2' })).rejects.toThrow('R2 down')
    expect(await readRenderArtifact(env, 1)).toEqual(before)
    await env.DB.prepare('UPDATE markdown SET sourceHash = \'changed\'').run()
    expect(await replaceDeployedRenderArtifact(env, stored, stored.artifactHash, { storage: 'r2' })).toBeUndefined()
    expect(await readRenderArtifact(env, 1)).toEqual(before)
  })

  it('does not clear D1 bodies until readback succeeds, or overwrite a concurrent deployment', async () => {
    const stored = await seed()
    const before = await readRenderArtifact(env, 1)
    const corrupted = { ...env, OSS: { put: env.OSS.put.bind(env.OSS), get: async () => ({ text: async () => 'corrupt' }) } } as unknown as Env
    await expect(transferArtifactStorage(corrupted, { fileId: 1, ownerId: 7, artifactHash: stored.artifactHash, from: 'd1', to: 'r2' })).rejects.toThrow('verification failed')
    expect(await readRenderArtifact(env, 1)).toEqual(before)
    const racing = { ...env, OSS: { put: env.OSS.put.bind(env.OSS), get: async (key: string) => {
      await env.DB.prepare('UPDATE markdown_render SET artifactHash = \'concurrent\'').run()
      return env.OSS.get(key)
    } } } as unknown as Env
    expect(await transferArtifactStorage(racing, { fileId: 1, ownerId: 7, artifactHash: stored.artifactHash, from: 'd1', to: 'r2' })).toEqual({ status: 'conflict' })
    expect(await readRenderArtifact(env, 1)).toMatchObject({ javascript: stored.javascript, javascriptKey: null, artifactHash: 'concurrent' })
  })

  it('scopes listing and transfer to the Owner, including recycled but not purged Files', async () => {
    const stored = await seed()
    expect(await listArtifactStorage(env, 8)).toEqual([])
    expect(await transfer(stored.artifactHash, 'd1', 'r2', 8)).toEqual({ status: 'conflict' })
    await trash(env, 1)
    expect(await listArtifactStorage(env, 7)).toMatchObject([{ fileId: 1, mode: 'd1' }])
    expect(await transfer(stored.artifactHash, 'd1', 'r2')).toEqual({ status: 'migrated' })
    expect((await getModule(context(env, 7))).status).toBe(404)
    await restore(env, 1)
    const restored = await getModule(context())
    expect(restored.status).toBe(200)
    expect(await restored.text()).toBe(serializeJavascriptResource(input.javascript))
    await trash(env, 1)
    await purge(env, 1)
    expect(await listArtifactStorage(env, 7)).toEqual([])
    expect((await getModule(context(env, 7))).status).toBe(404)
  })
})
