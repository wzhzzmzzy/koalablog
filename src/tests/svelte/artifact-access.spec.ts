import { type ArtifactAccessInput, decideArtifactAccess } from '@/lib/svelte/artifact-access'
import { describe, expect, it } from 'vitest'

const activeFile = {
  id: 7,
  deletedAt: null,
  private: false,
  renderer: 'svelte' as const,
  sourceHash: 'a'.repeat(64),
}

function decide(overrides: Partial<ArtifactAccessInput> = {}) {
  return decideArtifactAccess({
    authenticated: false,
    artifactSourceHash: activeFile.sourceHash,
    file: activeFile,
    representation: 'resource',
    requestedSourceHash: activeFile.sourceHash,
    ...overrides,
  })
}

describe('svelte Artifact access decisions', () => {
  it('denies missing, trashed, Markdown, and stale-hash requests without artifact cache state', () => {
    expect(decide({ file: undefined })).toEqual({ cacheControl: 'no-store', status: 404, type: 'not_found' })
    expect(decide({ file: { ...activeFile, deletedAt: new Date() } })).toEqual({ cacheControl: 'no-store', status: 404, type: 'not_found' })
    expect(decide({ file: { ...activeFile, renderer: 'markdown' } })).toEqual({ cacheControl: 'no-store', status: 404, type: 'not_found' })
    expect(decide({ requestedSourceHash: 'b'.repeat(64) })).toEqual({ cacheControl: 'no-store', status: 404, type: 'not_found' })
  })

  it('keeps private Page redirect behavior separate from private Artifact resource concealment', () => {
    const file = { ...activeFile, private: true }
    expect(decide({ file, representation: 'page' })).toEqual({ cacheControl: 'no-store', location: '/guest-login?id=7', status: 302, type: 'guest_login' })
    expect(decide({ file, representation: 'resource' })).toEqual({ cacheControl: 'no-store', status: 404, type: 'not_found' })
  })

  it('maps missing or stale Artifacts to an uncached Page 503 and an uncached resource 404', () => {
    expect(decide({ artifactSourceHash: undefined, representation: 'page' })).toEqual({ cacheControl: 'no-store', status: 503, type: 'artifact_unavailable' })
    expect(decide({ artifactSourceHash: 'b'.repeat(64), representation: 'resource' })).toEqual({ cacheControl: 'no-store', status: 404, type: 'not_found' })
  })

  it('allows only current Artifacts with the representation cache contract', () => {
    expect(decide({ representation: 'page' })).toEqual({ cacheControl: 'public, no-cache', status: 200, type: 'allowed' })
    expect(decide({ authenticated: true, file: { ...activeFile, private: true } })).toEqual({ cacheControl: 'private, no-store', status: 200, type: 'allowed' })
  })
})
