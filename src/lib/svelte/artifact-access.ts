import type { FileRecord } from '@/db/types'

export type ArtifactRepresentation = 'page' | 'resource'

export type ArtifactAccessDecision =
  | { cacheControl: 'no-store', status: 404, type: 'not_found' }
  | { cacheControl: 'no-store', location: string, status: 302, type: 'guest_login' }
  | { cacheControl: 'no-store', status: 503, type: 'artifact_unavailable' }
  | { cacheControl: 'private, no-store' | 'public, no-cache', status: 200, type: 'allowed' }

export interface ArtifactAccessInput {
  artifactSourceHash?: string
  authenticated: boolean
  file?: Pick<FileRecord, 'deletedAt' | 'id' | 'private' | 'renderer' | 'sourceHash'>
  representation: ArtifactRepresentation
  requestedSourceHash?: string
}

function notFound(): ArtifactAccessDecision {
  return { cacheControl: 'no-store', status: 404, type: 'not_found' }
}

export function decideArtifactAccess(input: ArtifactAccessInput): ArtifactAccessDecision {
  const { file, representation } = input
  if (!file || file.deletedAt || file.renderer !== 'svelte')
    return notFound()
  if (file.private && !input.authenticated) {
    return representation === 'page'
      ? { cacheControl: 'no-store', location: `/guest-login?id=${file.id}`, status: 302, type: 'guest_login' }
      : notFound()
  }
  if (input.requestedSourceHash && input.requestedSourceHash !== file.sourceHash)
    return notFound()
  if (input.artifactSourceHash !== file.sourceHash) {
    return representation === 'page'
      ? { cacheControl: 'no-store', status: 503, type: 'artifact_unavailable' }
      : notFound()
  }
  return {
    cacheControl: file.private ? 'private, no-store' : 'public, no-cache',
    status: 200,
    type: 'allowed',
  }
}
