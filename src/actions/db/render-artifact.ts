import { ActionError, defineAction } from 'astro:actions'
import { z } from 'astro:schema'
import { readById } from '@/db/markdown'
import { readDeployedRenderArtifact, readDeploymentSummary, replaceDeployedRenderArtifact } from '@/db/render-artifact'
import { calculateArtifactHashes, canonicalDependencies } from '@/lib/svelte/artifact-hash'
import { artifactLimitViolation } from '@/lib/svelte/artifact-limits'
import { dependencyDiff, sameDependencies } from '@/lib/svelte/dependency-diff'
import { isCanonicalSnapshotHtml } from '@/lib/svelte/snapshot'
import { SVELTE_TOOLCHAIN_VERSIONS, UNOCSS_CONFIG_HASH } from '@/lib/svelte/toolchain'
import { loginGuard } from '../utils/auth'

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

function reject(code: 'CONFLICT' | 'CONTENT_TOO_LARGE' | 'UNPROCESSABLE_CONTENT', detail: Record<string, unknown>): never {
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
    await loginGuard(ctx)
    const { confirmation, ...artifact } = input
    const env = ctx.locals.runtime?.env || {}
    const file = await readById(env, artifact.fileId)
    if (!file || file.userId !== ctx.locals.session.userId)
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
      return reject('CONTENT_TOO_LARGE', { code: 'artifact_too_large', field: violation })

    const hashes = await calculateArtifactHashes(artifact)
    const deployed = await readDeployedRenderArtifact(env, artifact.fileId)
    const rebuiltDeployment = deployed?.sourceHash === artifact.sourceHash ? deployed : undefined
    const dependenciesChanged = rebuiltDeployment && !sameDependencies(rebuiltDeployment.dependencies, artifact.dependencies)
    if (dependenciesChanged && !confirmation) {
      return reject('CONFLICT', {
        code: 'dependency_changed',
        currentArtifactHash: rebuiltDeployment.artifactHash,
        proposedArtifactHash: hashes.artifactHash,
        diff: dependencyDiff(rebuiltDeployment.dependencies, artifact.dependencies),
      })
    }
    if (confirmation && (
      !rebuiltDeployment
      || rebuiltDeployment.artifactHash !== confirmation.currentArtifactHash
      || hashes.artifactHash !== confirmation.proposedArtifactHash
    )) {
      return reject('CONFLICT', { code: 'dependency_confirmation_stale' })
    }

    const attached = await replaceDeployedRenderArtifact(env, { ...artifact, ...hashes }, rebuiltDeployment?.artifactHash ?? null)
    if (!attached)
      return reject('CONFLICT', { code: confirmation ? 'dependency_confirmation_stale' : 'artifact_changed' })
    return attached
  },
})

export const status = defineAction({
  accept: 'json',
  input: z.object({ fileId: z.number().int().positive() }).strict(),
  handler: async (input, ctx) => {
    await loginGuard(ctx)
    const summary = await readDeploymentSummary(
      ctx.locals.runtime?.env || {},
      input.fileId,
      ctx.locals.session.userId ?? undefined,
    )
    if (!summary)
      throw new ActionError({ code: 'NOT_FOUND', message: 'File not found' })
    return summary
  },
})
