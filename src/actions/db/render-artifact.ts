import { readById } from '@/db/markdown'
import { readCurrentRenderArtifact, replaceCurrentRenderArtifact } from '@/db/render-artifact'
import { calculateArtifactHashes, canonicalDependencies } from '@/lib/svelte/artifact-hash'
import { artifactLimitViolation } from '@/lib/svelte/artifact-limits'
import { dependencyDiff, sameDependencies } from '@/lib/svelte/dependency-diff'
import { isCanonicalSnapshotHtml } from '@/lib/svelte/snapshot'
import { SVELTE_TOOLCHAIN_VERSIONS, UNOCSS_CONFIG_HASH } from '@/lib/svelte/toolchain'
import { ActionError, defineAction } from 'astro:actions'
import { z } from 'astro:schema'
import { authGuard, sourceHashMaintenanceWriteGuard } from '../utils/auth'

const sha256 = z.string().regex(/^[a-f0-9]{64}$/)

const dependency = z.object({
  url: z.string().url().refine(value => new URL(value).protocol === 'https:', 'Dependency URLs must use HTTPS'),
  bytes: z.number().int().nonnegative(),
  sha256,
}).strict()

const artifactInput = z.object({
  fileId: z.number().int().positive(),
  schemaVersion: z.literal(1),
  renderer: z.literal('svelte'),
  svelteVersion: z.string(),
  unocssVersion: z.string(),
  unocssConfigHash: sha256,
  sourceHash: sha256,
  dependencies: z.array(dependency),
  javascript: z.string(),
  css: z.string(),
  snapshotHtml: z.string(),
  confirmation: z.object({
    currentArtifactHash: sha256,
    proposedArtifactHash: sha256,
  }).strict().optional(),
}).strict()

function reject(code: 'CONFLICT' | 'PAYLOAD_TOO_LARGE' | 'UNPROCESSABLE_CONTENT', detail: Record<string, unknown>): never {
  throw new ActionError({ code, message: JSON.stringify(detail) })
}

function isCanonicalManifest(dependencies: z.infer<typeof dependency>[]) {
  const canonical = canonicalDependencies(dependencies)
  return new Set(dependencies.map(dependency => dependency.url)).size === dependencies.length
    && dependencies.every((dependency, index) => (
      dependency.url === canonical[index]?.url
      && dependency.bytes === canonical[index]?.bytes
      && dependency.sha256 === canonical[index]?.sha256
    ))
}

function hasSupportedToolchain(input: z.infer<typeof artifactInput>) {
  return input.svelteVersion === SVELTE_TOOLCHAIN_VERSIONS.svelte
    && input.unocssVersion === SVELTE_TOOLCHAIN_VERSIONS.unocss
    && input.unocssConfigHash === UNOCSS_CONFIG_HASH
}

export const attach = defineAction({
  accept: 'json',
  input: artifactInput,
  handler: async (input, ctx) => {
    await authGuard(ctx)
    await sourceHashMaintenanceWriteGuard(ctx)
    const { confirmation, ...artifact } = input
    const env = ctx.locals.runtime?.env || {}
    const file = await readById(env, artifact.fileId)
    if (!file)
      throw new ActionError({ code: 'NOT_FOUND', message: 'File not found' })
    if (file.renderer !== 'svelte')
      return reject('CONFLICT', { code: confirmation ? 'dependency_confirmation_stale' : 'renderer_not_svelte' })
    if (file.sourceHash !== artifact.sourceHash)
      return reject('CONFLICT', { code: confirmation ? 'dependency_confirmation_stale' : 'source_hash_mismatch' })
    if (!hasSupportedToolchain(input))
      return reject('UNPROCESSABLE_CONTENT', { code: 'unsupported_toolchain' })
    if (!isCanonicalManifest(artifact.dependencies))
      return reject('UNPROCESSABLE_CONTENT', { code: 'invalid_dependency_manifest' })
    if (!await isCanonicalSnapshotHtml(artifact.snapshotHtml))
      return reject('UNPROCESSABLE_CONTENT', { code: 'invalid_snapshot' })

    const violation = artifactLimitViolation(artifact)
    if (violation)
      return reject('PAYLOAD_TOO_LARGE', { code: 'artifact_too_large', field: violation })

    const hashes = await calculateArtifactHashes(artifact)
    const current = await readCurrentRenderArtifact(env, artifact.fileId)
    const dependenciesChanged = current && !sameDependencies(current.dependencies, artifact.dependencies)
    if (dependenciesChanged && !confirmation) {
      return reject('CONFLICT', {
        code: 'dependency_changed',
        currentArtifactHash: current.artifactHash,
        proposedArtifactHash: hashes.artifactHash,
        diff: dependencyDiff(current.dependencies, artifact.dependencies),
      })
    }
    if (confirmation && (
      !current
      || current.artifactHash !== confirmation.currentArtifactHash
      || hashes.artifactHash !== confirmation.proposedArtifactHash
    )) {
      return reject('CONFLICT', { code: 'dependency_confirmation_stale' })
    }

    const attached = await replaceCurrentRenderArtifact(env, { ...artifact, ...hashes }, current?.artifactHash ?? null)
    if (!attached)
      return reject('CONFLICT', { code: confirmation ? 'dependency_confirmation_stale' : 'artifact_changed' })
    return attached
  },
})
