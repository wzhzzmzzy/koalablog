import type { APIRoute } from 'astro'
import { readArtifactAccess } from '@/db/render-artifact'
import { artifactFileId, artifactResourceResponse, isArtifactResourceRequest, noStoreResponse } from '@/lib/svelte/artifact-resource'

export const GET: APIRoute = async (ctx) => {
  const { fileId, sourceHash } = ctx.params
  if (!isArtifactResourceRequest(fileId, sourceHash))
    return noStoreResponse()

  const result = await readArtifactAccess(ctx.locals.runtime?.env || {}, {
    authenticated: Boolean(ctx.locals.session?.role),
    fileId: artifactFileId(fileId),
    representation: 'resource',
    requestedSourceHash: sourceHash,
  })
  if (result.decision.type !== 'allowed' || !result.artifact)
    return noStoreResponse()

  return artifactResourceResponse({
    body: result.artifact.css,
    cacheControl: result.decision.cacheControl,
    etag: `"koala-css-v1-sha256-${result.artifact.cssResourceHash}"`,
    ifNoneMatch: ctx.request.headers.get('If-None-Match'),
    mimeType: 'text/css; charset=utf-8',
    privateResource: result.decision.cacheControl === 'private, no-store',
  })
}
