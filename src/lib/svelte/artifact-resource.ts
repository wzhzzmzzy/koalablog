import type { ArtifactAccessDecision } from './artifact-access'

export interface ArtifactResourceInput {
  cacheControl: ArtifactAccessDecision['cacheControl']
  etag: string
  ifNoneMatch: string | null
  mimeType: string
  privateResource: boolean
  body: string
}

function noStoreResponse(status = 404) {
  return new Response(null, { headers: { 'Cache-Control': 'no-store' }, status })
}

export function isArtifactResourceRequest(fileId: string | undefined, sourceHash: string | undefined) {
  if (!fileId || !/^[1-9]\d*$/.test(fileId))
    return false

  const numericFileId = Number(fileId)
  return Number.isSafeInteger(numericFileId) && /^[a-f0-9]{64}$/.test(sourceHash || '')
}

export function artifactFileId(fileId: string) {
  return Number(fileId)
}

export function matchesIfNoneMatch(header: string | null, etag: string) {
  if (!header)
    return false

  return header.split(',').some((validator) => {
    const candidate = validator.trim()
    return candidate === '*' || candidate === etag || candidate === `W/${etag}`
  })
}

export function artifactResourceResponse(input: ArtifactResourceInput) {
  const headers = new Headers({
    'Cache-Control': input.cacheControl,
    'Content-Type': input.mimeType,
    'X-Content-Type-Options': 'nosniff',
  })

  if (input.privateResource)
    return new Response(input.body, { headers })

  headers.set('ETag', input.etag)
  if (matchesIfNoneMatch(input.ifNoneMatch, input.etag))
    return new Response(null, { headers, status: 304 })

  return new Response(input.body, { headers })
}

export { noStoreResponse }
