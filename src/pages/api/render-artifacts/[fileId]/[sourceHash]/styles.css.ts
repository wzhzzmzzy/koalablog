import type { APIRoute } from 'astro'
import { readArtifactBody, readArtifactMetadata } from '@/db/render-artifact'
import { artifactFileId, artifactResourceResponse, isArtifactResourceRequest, matchesIfNoneMatch, noStoreResponse } from '@/lib/svelte/artifact-resource'

export const GET: APIRoute = async (ctx) => {
  const { fileId, sourceHash } = ctx.params
  if (!fileId || !sourceHash || !isArtifactResourceRequest(fileId, sourceHash))
    return noStoreResponse()

  const env = ctx.locals.runtime?.env || {}
  const input = {
    sessionUserId: ctx.locals.session?.userId,
    fileId: artifactFileId(fileId),
    representation: 'resource' as const,
    requestedSourceHash: sourceHash,
  }
  const result = await readArtifactMetadata(env, input)
  if (result.decision.type !== 'allowed' || !result.artifact)
    return noStoreResponse()

  const responseInput = {
    body: null,
    cacheControl: result.decision.cacheControl,
    etag: `"koala-css-v1-sha256-${result.artifact.cssResourceHash}"`,
    ifNoneMatch: ctx.request.headers.get('If-None-Match'),
    mimeType: 'text/css; charset=utf-8',
    privateResource: result.decision.cacheControl === 'private, no-store',
  }
  if (!responseInput.privateResource && matchesIfNoneMatch(responseInput.ifNoneMatch, responseInput.etag))
    return artifactResourceResponse(responseInput)
  try {
    const css = await readArtifactBody(env, { ...input, schemaVersion: result.artifact.schemaVersion, artifactHash: result.artifact.artifactHash, privateResource: responseInput.privateResource }, 'css')
    if (css === undefined)
      return noStoreResponse()
    return artifactResourceResponse({ ...responseInput, body: css })
  }
  catch (error) {
    console.error('artifact_resource_read_failed', { fileId: input.fileId, sourceHash, message: error instanceof Error ? error.message : String(error) })
    return noStoreResponse(503)
  }
}
