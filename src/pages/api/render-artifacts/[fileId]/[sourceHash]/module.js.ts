import type { APIRoute } from 'astro'
import { readArtifactAccess } from '@/db/render-artifact'
import { serializeJavascriptResource } from '@/lib/svelte/artifact-hash'
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
    body: serializeJavascriptResource(result.artifact.javascript),
    cacheControl: result.decision.cacheControl,
    etag: `"koala-js-v1-sha256-${result.artifact.javascriptResourceHash}"`,
    ifNoneMatch: ctx.request.headers.get('If-None-Match'),
    mimeType: 'text/javascript; charset=utf-8',
    privateResource: result.decision.cacheControl === 'private, no-store',
  })
}
