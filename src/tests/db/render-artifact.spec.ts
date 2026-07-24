import { randomUUID } from 'node:crypto'
import { unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { purge, restore, saveFile, trash } from '@/db/markdown'
import { readCurrentRenderArtifact, readRenderArtifact, replaceCurrentRenderArtifact, replaceRenderArtifact } from '@/db/render-artifact'
import { defineRenderArtifactContract } from '@/tests/shared/render-artifact-contract'
import { createClient } from '@libsql/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const env = {} as Env

function artifact(fileId: number, sourceHash: string, javascript = 'export default {}') {
  return {
    fileId,
    schemaVersion: 1 as const,
    renderer: 'svelte' as const,
    svelteVersion: '5.19.2',
    unocssVersion: '65.4.3',
    unocssConfigHash: 'unocss-config-hash',
    sourceHash,
    dependencies: [],
    artifactHash: `artifact-${javascript}`,
    javascriptResourceHash: `javascript-${javascript}`,
    cssResourceHash: `css-${javascript}`,
    javascript,
    css: '.page {}',
    snapshotHtml: '<main>Snapshot</main>',
  }
}

function useRenderArtifactDatabase() {
  let databasePath: string

  beforeEach(async () => {
    databasePath = join(tmpdir(), `koalablog-render-artifact-${randomUUID()}.db`)
    vi.stubEnv('SQLITE_URL', `file:${databasePath}`)

    const client = createClient({ url: `file:${databasePath}` })
    await client.executeMultiple(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE markdown (
        id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        source integer NOT NULL,
        path text NOT NULL,
        title text NOT NULL,
        renderer text DEFAULT 'markdown' NOT NULL,
        content text NOT NULL,
        sourceHash text NOT NULL,
        tags text,
        incoming_links text,
        outgoing_links text,
        private integer DEFAULT false NOT NULL,
        remoteTruth integer DEFAULT false NOT NULL,
        revision integer DEFAULT 1 NOT NULL,
        createdAt integer DEFAULT (unixepoch()) NOT NULL,
        updatedAt integer DEFAULT (unixepoch()) NOT NULL,
        deletedAt integer
      );
      CREATE UNIQUE INDEX markdown_active_path_unique ON markdown (path) WHERE deletedAt IS NULL;
      CREATE INDEX markdown_deleted_at_idx ON markdown (deletedAt);
      CREATE TABLE markdown_render (
        fileId integer PRIMARY KEY NOT NULL REFERENCES markdown(id) ON DELETE CASCADE,
        schemaVersion integer NOT NULL,
        renderer text NOT NULL,
        svelteVersion text NOT NULL,
        unocssVersion text NOT NULL,
        unocssConfigHash text NOT NULL,
        sourceHash text NOT NULL,
        dependencies text NOT NULL,
        artifactHash text NOT NULL,
        javascriptResourceHash text NOT NULL,
        cssResourceHash text NOT NULL,
        javascript text NOT NULL,
        css text NOT NULL,
        snapshotHtml text NOT NULL,
        createdAt integer DEFAULT (unixepoch()) NOT NULL,
        updatedAt integer DEFAULT (unixepoch()) NOT NULL
      );
    `)
    client.close()
  })

  afterEach(async () => {
    vi.unstubAllEnvs()
    await unlink(databasePath).catch(() => undefined)
  })
}

async function createSvelteFile(content = '<h1>Initial</h1>') {
  const created = await saveFile(env, {
    id: 0,
    path: '/page/render-artifact',
    renderer: 'svelte',
    content,
    private: false,
    baseRevision: 0,
  })
  if (created.status !== 'saved')
    throw new Error('Expected fixture File creation to succeed')
  return created.file
}

describe('render Artifact persistence', () => {
  useRenderArtifactDatabase()

  it('reads the first Artifact and replaces it in the one row for its File', async () => {
    const file = await createSvelteFile()
    const first = artifact(file.id, file.sourceHash, 'export const version = "A"')
    const second = artifact(file.id, file.sourceHash, 'export const version = "B"')

    await replaceRenderArtifact(env, first)
    expect(await readRenderArtifact(env, file.id)).toMatchObject(first)
    expect(await readCurrentRenderArtifact(env, file.id)).toMatchObject(first)

    await replaceRenderArtifact(env, second)
    expect(await readRenderArtifact(env, file.id)).toMatchObject(second)
    expect(await readCurrentRenderArtifact(env, file.id)).toMatchObject(second)
  })

  it('preserves an Artifact through Source and Renderer changes, and makes it Current only for exact active Svelte Source', async () => {
    const original = await createSvelteFile()
    const stored = artifact(original.id, original.sourceHash)
    await replaceRenderArtifact(env, stored)

    const changed = await saveFile(env, {
      id: original.id,
      path: original.path,
      renderer: 'svelte',
      content: '<h1>Changed</h1>',
      private: false,
      baseRevision: original.revision,
    })
    if (changed.status !== 'saved')
      throw new Error('Expected Source change to succeed')
    expect(await readRenderArtifact(env, original.id)).toMatchObject(stored)
    expect(await readCurrentRenderArtifact(env, original.id)).toBeUndefined()

    const markdown = await saveFile(env, {
      id: original.id,
      path: original.path,
      renderer: 'markdown',
      content: original.content,
      private: true,
      baseRevision: changed.file.revision,
    })
    if (markdown.status !== 'saved')
      throw new Error('Expected Renderer switch to succeed')
    expect(await readCurrentRenderArtifact(env, original.id)).toBeUndefined()

    const reverted = await saveFile(env, {
      id: original.id,
      path: '/page/render-artifact-renamed',
      renderer: 'svelte',
      content: original.content,
      private: true,
      baseRevision: markdown.file.revision,
    })
    if (reverted.status !== 'saved')
      throw new Error('Expected exact Svelte Source reversion to succeed')
    expect(reverted.file.sourceHash).toBe(original.sourceHash)
    expect(await readCurrentRenderArtifact(env, original.id)).toMatchObject(stored)
  })

  it('does not replace the existing Artifact when Source changes before the conditional attach', async () => {
    const original = await createSvelteFile()
    await replaceRenderArtifact(env, artifact(original.id, original.sourceHash, 'export const version = "A"'))
    const before = await readRenderArtifact(env, original.id)
    const changed = await saveFile(env, {
      id: original.id,
      path: original.path,
      renderer: 'svelte',
      content: '<h1>Changed</h1>',
      private: false,
      baseRevision: original.revision,
    })
    if (changed.status !== 'saved')
      throw new Error('Expected Source change to succeed')

    const attached = await replaceCurrentRenderArtifact(env, artifact(original.id, original.sourceHash, 'export const version = "B"'))
    expect(attached).toBeUndefined()
    expect(await readRenderArtifact(env, original.id)).toEqual(before)
  })

  it('replaces only the exact Current Artifact that was reviewed for confirmation', async () => {
    const file = await createSvelteFile()
    const first = artifact(file.id, file.sourceHash, 'export const version = "A"')
    await replaceRenderArtifact(env, first)
    const second = artifact(file.id, file.sourceHash, 'export const version = "B"')
    expect(await replaceCurrentRenderArtifact(env, second, first.artifactHash)).toEqual(second)
    const beforeStaleConfirmation = await readRenderArtifact(env, file.id)

    const stale = await replaceCurrentRenderArtifact(env, artifact(file.id, file.sourceHash, 'export const version = "C"'), first.artifactHash)
    expect(stale).toBeUndefined()
    expect(await readRenderArtifact(env, file.id)).toEqual(beforeStaleConfirmation)
  })

  it('never revives replaced Artifact history after an exact Source reversion', async () => {
    const original = await createSvelteFile()
    const first = artifact(original.id, original.sourceHash, 'export const version = "A"')
    await replaceRenderArtifact(env, first)

    const changed = await saveFile(env, {
      id: original.id,
      path: original.path,
      renderer: 'svelte',
      content: '<h1>Changed</h1>',
      private: false,
      baseRevision: original.revision,
    })
    if (changed.status !== 'saved')
      throw new Error('Expected Source change to succeed')
    const replacement = artifact(original.id, changed.file.sourceHash, 'export const version = "B"')
    await replaceRenderArtifact(env, replacement)

    const reverted = await saveFile(env, {
      id: original.id,
      path: original.path,
      renderer: 'svelte',
      content: original.content,
      private: false,
      baseRevision: changed.file.revision,
    })
    if (reverted.status !== 'saved')
      throw new Error('Expected exact Source reversion to succeed')

    expect(await readRenderArtifact(env, original.id)).toMatchObject(replacement)
    expect(await readCurrentRenderArtifact(env, original.id)).toBeUndefined()
  })

  it('preserves an Artifact in trash, restores its currentness, and cascades it away on purge', async () => {
    const file = await createSvelteFile()
    const stored = artifact(file.id, file.sourceHash)
    await replaceRenderArtifact(env, stored)

    expect(await trash(env, file.id)).toMatchObject({ status: 'trashed' })
    expect(await readRenderArtifact(env, file.id)).toMatchObject(stored)
    expect(await readCurrentRenderArtifact(env, file.id)).toBeUndefined()

    expect(await restore(env, file.id)).toMatchObject({ status: 'restored' })
    expect(await readCurrentRenderArtifact(env, file.id)).toMatchObject(stored)

    expect(await trash(env, file.id)).toMatchObject({ status: 'trashed' })
    expect(await purge(env, file.id)).toEqual({ status: 'purged' })
    expect(await readRenderArtifact(env, file.id)).toBeUndefined()
  })
})

let contractDatabasePath = ''

defineRenderArtifactContract({
  name: 'SQLite',
  env,
  prepare: async () => {
    contractDatabasePath = join(tmpdir(), `koalablog-render-artifact-contract-${randomUUID()}.db`)
    vi.stubEnv('SQLITE_URL', `file:${contractDatabasePath}`)
    const client = createClient({ url: `file:${contractDatabasePath}` })
    await client.executeMultiple(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE markdown (
        id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        source integer NOT NULL,
        path text NOT NULL,
        title text NOT NULL,
        renderer text DEFAULT 'markdown' NOT NULL,
        content text NOT NULL,
        sourceHash text NOT NULL,
        tags text,
        incoming_links text,
        outgoing_links text,
        private integer DEFAULT false NOT NULL,
        remoteTruth integer DEFAULT false NOT NULL,
        revision integer DEFAULT 1 NOT NULL,
        createdAt integer DEFAULT (unixepoch()) NOT NULL,
        updatedAt integer DEFAULT (unixepoch()) NOT NULL,
        deletedAt integer
      );
      CREATE UNIQUE INDEX markdown_active_path_unique ON markdown (path) WHERE deletedAt IS NULL;
      CREATE INDEX markdown_deleted_at_idx ON markdown (deletedAt);
      CREATE TABLE markdown_render (
        fileId integer PRIMARY KEY NOT NULL REFERENCES markdown(id) ON DELETE CASCADE,
        schemaVersion integer NOT NULL,
        renderer text NOT NULL,
        svelteVersion text NOT NULL,
        unocssVersion text NOT NULL,
        unocssConfigHash text NOT NULL,
        sourceHash text NOT NULL,
        dependencies text NOT NULL,
        artifactHash text NOT NULL,
        javascriptResourceHash text NOT NULL,
        cssResourceHash text NOT NULL,
        javascript text NOT NULL,
        css text NOT NULL,
        snapshotHtml text NOT NULL,
        createdAt integer DEFAULT (unixepoch()) NOT NULL,
        updatedAt integer DEFAULT (unixepoch()) NOT NULL
      );
    `)
    client.close()
  },
  cleanup: async () => {
    vi.unstubAllEnvs()
    await unlink(contractDatabasePath).catch(() => undefined)
  },
})
