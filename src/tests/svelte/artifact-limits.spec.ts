import { artifactByteLengths, artifactLimitViolation, SVELTE_ARTIFACT_LIMITS } from '@/lib/svelte/artifact-limits'
import { describe, expect, it } from 'vitest'

function artifact(overrides: Partial<{ css: string, javascript: string, snapshotHtml: string }> = {}) {
  return {
    css: '',
    dependencies: [],
    javascript: '',
    renderer: 'svelte' as const,
    schemaVersion: 1 as const,
    snapshotHtml: '',
    sourceHash: 'a'.repeat(64),
    svelteVersion: '5.19.2',
    unocssConfigHash: 'b'.repeat(64),
    unocssVersion: '65.4.3',
    ...overrides,
  }
}

describe('svelte Artifact byte budgets', () => {
  it('counts UTF-8 bytes instead of JavaScript code units', () => {
    const value = artifact({ css: '🐨' })
    expect(artifactByteLengths(value).css).toBe(4)
  })

  it('accepts exact limits and rejects one UTF-8 byte beyond them', () => {
    expect(artifactLimitViolation(artifact({ css: 'a'.repeat(SVELTE_ARTIFACT_LIMITS.css) }))).toBeNull()
    expect(artifactLimitViolation(artifact({ css: 'a'.repeat(SVELTE_ARTIFACT_LIMITS.css + 1) }))).toBe('css')
  })
})
