import type { APIRoute } from 'astro'
import { readArtifactBody, readArtifactMetadata } from '@/db/render-artifact'
import { serializeJavascriptResource } from '@/lib/svelte/artifact-hash'
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
    etag: `"koala-js-v1-sha256-${result.artifact.javascriptResourceHash}"`,
    ifNoneMatch: ctx.request.headers.get('If-None-Match'),
    mimeType: 'text/javascript; charset=utf-8',
    privateResource: result.decision.cacheControl === 'private, no-store',
  }
  if (!responseInput.privateResource && matchesIfNoneMatch(responseInput.ifNoneMatch, responseInput.etag))
    return artifactResourceResponse(responseInput)
  const javascript = await readArtifactBody(env, { ...input, artifactHash: result.artifact.artifactHash, privateResource: responseInput.privateResource }, 'javascript')
  if (javascript === undefined)
    return noStoreResponse()
  return artifactResourceResponse({ ...responseInput, body: serializeJavascriptResource(javascript) })
}
