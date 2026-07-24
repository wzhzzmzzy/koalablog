import type { SvelteArtifactInputV1 } from './contracts'
import { utf8ByteLength } from './artifact-hash'

export const SVELTE_ARTIFACT_LIMITS = {
  css: 200_000,
  javascript: 1_400_000,
  metadata: 50_000,
  row: 1_800_000,
  snapshotHtml: 150_000,
} as const

export function artifactByteLengths(input: SvelteArtifactInputV1) {
  const metadata = JSON.stringify({
    dependencies: input.dependencies,
    renderer: input.renderer,
    schemaVersion: input.schemaVersion,
    sourceHash: input.sourceHash,
    svelteVersion: input.svelteVersion,
    unocssConfigHash: input.unocssConfigHash,
    unocssVersion: input.unocssVersion,
  })
  return {
    css: utf8ByteLength(input.css),
    javascript: utf8ByteLength(input.javascript),
    metadata: utf8ByteLength(metadata),
    row: utf8ByteLength(input.javascript) + utf8ByteLength(input.css) + utf8ByteLength(input.snapshotHtml) + utf8ByteLength(metadata),
    snapshotHtml: utf8ByteLength(input.snapshotHtml),
  }
}

export function artifactLimitViolation(input: SvelteArtifactInputV1) {
  const lengths = artifactByteLengths(input)
  return Object.entries(SVELTE_ARTIFACT_LIMITS).find(([field, limit]) => lengths[field as keyof typeof lengths] > limit)?.[0] ?? null
}
