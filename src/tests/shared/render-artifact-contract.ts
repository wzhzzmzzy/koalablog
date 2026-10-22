import type { SvelteDependencyManifestEntry } from '@/lib/svelte/contracts'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { connectDB } from '@/db'
import { purge, restore, saveFile, trash } from '@/db/markdown'
import { readArtifactAccess, readArtifactBody, readArtifactMetadata, readDeployedRenderArtifact, readRenderArtifact, replaceDeployedRenderArtifact, replaceRenderArtifact } from '@/db/render-artifact'
import { serializeJavascriptResource } from '@/lib/svelte/artifact-hash'
import { artifactByteLengths, artifactLimitViolation, SVELTE_ARTIFACT_LIMITS } from '@/lib/svelte/artifact-limits'

interface RenderArtifactContractHarness {
  cleanup?: () => Promise<void>
  env: Env
  name: string
  prepare: () => Promise<void>
}

function artifact(fileId: number, sourceHash: string, overrides: Record<string, unknown> = {}) {
  return {
    fileId,
    schemaVersion: 2 as const,
    renderer: 'svelte' as const,
    svelteVersion: '5.19.2',
    unocssVersion: '65.4.3',
    unocssConfigHash: 'a'.repeat(64),
    sourceHash,
    dependencies: [] as SvelteDependencyManifestEntry[],
    artifactHash: 'b'.repeat(64),
    javascriptResourceHash: 'c'.repeat(64),
    cssResourceHash: 'd'.repeat(64),
    javascript: '',
    css: '',
    ...overrides,
  }
}

function artifactAtExactRowLimit(fileId: number, sourceHash: string) {
  const value = artifact(fileId, sourceHash, {
    javascript: 'j'.repeat(SVELTE_ARTIFACT_LIMITS.javascript),
    css: 'c'.repeat(SVELTE_ARTIFACT_LIMITS.css),
    dependencies: [{ url: 'https://example.test/', bytes: 0, sha256: 'e'.repeat(64) }],
  })
  const metadata = artifactByteLengths(value).metadata
  value.dependencies[0].url += 'x'.repeat(SVELTE_ARTIFACT_LIMITS.metadata - metadata)
  return value
}

async function createSvelteFile(env: Env) {
  const created = await saveFile(env, {
    id: 0,
    path: '/page/render-artifact-contract',
    renderer: 'svelte',
    content: '<h1>Contract</h1>',
    private: false,
    baseRevision: 0,
  })
  if (created.status !== 'saved')
    throw new Error('Expected fixture File creation to succeed')
  return created.file
}

function useHarness(harness: RenderArtifactContractHarness) {
  beforeEach(harness.prepare)
  afterEach(async () => harness.cleanup?.())
}

export function defineRenderArtifactContract(harness: RenderArtifactContractHarness) {
  describe(`render Artifact ${harness.name} contract`, () => {
    useHarness(harness)

    it('accepts exact UTF-8 field and combined-row limits, and rejects one byte beyond each field', async () => {
      const file = await createSvelteFile(harness.env)
      const exact = artifactAtExactRowLimit(file.id, file.sourceHash)
      expect(artifactByteLengths(exact).row).toBe(SVELTE_ARTIFACT_LIMITS.row)
      expect(artifactLimitViolation(exact)).toBeNull()
      await expect(replaceRenderArtifact(harness.env, exact)).resolves.toMatchObject({ fileId: file.id })

      for (const [field, limit] of Object.entries(SVELTE_ARTIFACT_LIMITS)) {
        if (field === 'metadata' || field === 'row')
          continue
        expect(artifactLimitViolation(artifact(file.id, file.sourceHash, { [field]: 'x'.repeat(limit - 1) }))).toBeNull()
        expect(artifactLimitViolation(artifact(file.id, file.sourceHash, { [field]: 'x'.repeat(limit + 1) }))).toBe(field)
      }
      const justBelowRow = { ...exact, dependencies: exact.dependencies.map(dependency => ({ ...dependency, url: dependency.url.slice(0, -1) })) }
      const aboveRow = { ...exact, dependencies: exact.dependencies.map(dependency => ({ ...dependency, url: `${dependency.url}x` })) }
      expect(artifactByteLengths(justBelowRow).row).toBe(SVELTE_ARTIFACT_LIMITS.row - 1)
      expect(artifactLimitViolation(justBelowRow)).toBeNull()
      expect(artifactByteLengths(aboveRow).row).toBe(SVELTE_ARTIFACT_LIMITS.row + 1)
      expect(artifactLimitViolation(aboveRow)).toBe('metadata')
      const oversizedMetadata = artifact(file.id, file.sourceHash, {
        dependencies: [{ url: `https://example.test/${'x'.repeat(SVELTE_ARTIFACT_LIMITS.metadata)}`, bytes: 0, sha256: 'e'.repeat(64) }],
      })
      expect(artifactLimitViolation(oversizedMetadata)).toBe('metadata')
      expect(await readRenderArtifact(harness.env, file.id)).toMatchObject(exact)
    })

    it('replaces one row, preserves it through trash and restore, then cascades it on purge', async () => {
      const file = await createSvelteFile(harness.env)
      const first = artifact(file.id, file.sourceHash, { artifactHash: '1'.repeat(64) })
      const second = artifact(file.id, file.sourceHash, { artifactHash: '2'.repeat(64) })
      await replaceRenderArtifact(harness.env, first)
      await replaceRenderArtifact(harness.env, second)
      expect(await readDeployedRenderArtifact(harness.env, file.id)).toMatchObject({ artifactHash: second.artifactHash, sourceHash: second.sourceHash, dependencies: second.dependencies })

      await trash(harness.env, file.id)
      expect(await readRenderArtifact(harness.env, file.id)).toMatchObject(second)
      await restore(harness.env, file.id)
      expect(await readDeployedRenderArtifact(harness.env, file.id)).toMatchObject({ artifactHash: second.artifactHash, sourceHash: second.sourceHash, dependencies: second.dependencies })
      await trash(harness.env, file.id)
      await purge(harness.env, file.id)
      expect(await readRenderArtifact(harness.env, file.id)).toBeUndefined()
    })

    it('keeps the prior Artifact byte-identical when its reviewed Source no longer matches', async () => {
      const file = await createSvelteFile(harness.env)
      const first = artifact(file.id, file.sourceHash, { artifactHash: '1'.repeat(64) })
      await replaceRenderArtifact(harness.env, first)
      const before = await readRenderArtifact(harness.env, file.id)

      const changed = await saveFile(harness.env, {
        id: file.id,
        path: file.path,
        renderer: 'svelte',
        content: '<h1>Changed</h1>',
        private: false,
        baseRevision: file.revision,
      })
      if (changed.status !== 'saved')
        throw new Error('Expected Source change to succeed')
      await expect(replaceDeployedRenderArtifact(harness.env, artifact(file.id, file.sourceHash))).resolves.toBeUndefined()
      expect(await readRenderArtifact(harness.env, file.id)).toEqual(before)
    })

    it('reads only metadata and the requested representation, not Source or dependency JSON', async () => {
      const file = await createSvelteFile(harness.env)
      const stored = artifact(file.id, file.sourceHash, { javascript: 'module', css: '' })
      await replaceRenderArtifact(harness.env, stored)
      await connectDB(harness.env).run('UPDATE markdown_render SET dependencies = \'invalid JSON must not be decoded on delivery\'')
      const input = { fileId: file.id, representation: 'resource' as const, requestedSourceHash: file.sourceHash }
      const metadata = await readArtifactMetadata(harness.env, input)
      expect(metadata.artifact).toEqual({
        fileId: file.id,
        schemaVersion: 2,
        sourceHash: file.sourceHash,
        artifactHash: stored.artifactHash,
        javascriptResourceHash: stored.javascriptResourceHash,
        cssResourceHash: stored.cssResourceHash,
      })
      const bodyInput = { ...input, artifactHash: stored.artifactHash, privateResource: false }
      expect(await readArtifactBody(harness.env, bodyInput, 'javascript')).toBe(serializeJavascriptResource('module'))
      expect(await readArtifactBody(harness.env, bodyInput, 'css')).toBe('')
      const page = await readArtifactAccess(harness.env, { ...input, representation: 'page' })
      expect(page.artifact).toEqual({ ...metadata.artifact })
    })

    it('rechecks visibility, Owner, trash and Artifact identity between metadata and body reads', async () => {
      const file = await createSvelteFile(harness.env)
      const stored = artifact(file.id, file.sourceHash, { javascript: 'module' })
      await replaceRenderArtifact(harness.env, stored)
      const db = connectDB(harness.env)
      await db.run('UPDATE markdown SET userId = 7')
      const input = { fileId: file.id, representation: 'resource' as const, requestedSourceHash: file.sourceHash, artifactHash: stored.artifactHash, privateResource: false, sessionUserId: 7 }
      expect((await readArtifactMetadata(harness.env, input)).decision.type).toBe('allowed')
      await db.run('UPDATE markdown SET private = 1')
      expect(await readArtifactBody(harness.env, input, 'javascript')).toBeUndefined()
      const privateInput = { ...input, privateResource: true }
      expect(await readArtifactBody(harness.env, privateInput, 'javascript')).toBe(serializeJavascriptResource('module'))
      expect(await readArtifactBody(harness.env, { ...privateInput, sessionUserId: 8 }, 'javascript')).toBeUndefined()
      expect((await readArtifactMetadata(harness.env, { ...input, sessionUserId: 8 })).decision.type).toBe('not_found')
      await db.run('UPDATE markdown SET sourceHash = \'new saved Source\'')
      expect(await readArtifactBody(harness.env, privateInput, 'javascript')).toBe(serializeJavascriptResource('module'))
      await replaceRenderArtifact(harness.env, { ...stored, artifactHash: 'e'.repeat(64), javascript: 'replacement' })
      expect(await readArtifactBody(harness.env, privateInput, 'javascript')).toBeUndefined()
      const replacedInput = { ...privateInput, artifactHash: 'e'.repeat(64) }
      expect(await readArtifactBody(harness.env, replacedInput, 'javascript')).toBe(serializeJavascriptResource('replacement'))
      await trash(harness.env, file.id)
      expect(await readArtifactBody(harness.env, replacedInput, 'javascript')).toBeUndefined()
      expect((await readArtifactMetadata(harness.env, input)).decision.type).toBe('not_found')
      await restore(harness.env, file.id)
      expect(await readArtifactBody(harness.env, replacedInput, 'javascript')).toBe(serializeJavascriptResource('replacement'))
      await trash(harness.env, file.id)
      await purge(harness.env, file.id)
      expect(await readArtifactBody(harness.env, replacedInput, 'javascript')).toBeUndefined()
    })
  })
}
