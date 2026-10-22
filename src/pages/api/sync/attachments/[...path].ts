import type { APIRoute } from 'astro'
import { objectResponse } from '@/lib/oss/response'
import { attachmentPath, requireSyncOwner, syncAttachmentKey, syncJson } from '@/lib/sync/api'

function objectStore(ctx: Parameters<APIRoute>[0]) {
  return ctx.locals.OSS || ctx.locals.runtime?.env.OSS
}

export const GET: APIRoute = async (ctx) => {
  const authorization = await requireSyncOwner(ctx, { allowSession: true })
  if ('response' in authorization)
    return authorization.response
  const path = attachmentPath(ctx.params.path)
  const oss = objectStore(ctx)
  if (!path || !oss)
    return syncJson({ error: 'not_found' }, 404)
  const object = await oss.get(syncAttachmentKey(authorization.userId, path))
  if (!object)
    return syncJson({ error: 'not_found' }, 404)
  return objectResponse(object, true)
}

export const PUT: APIRoute = async (ctx) => {
  const authorization = await requireSyncOwner(ctx, { allowSession: true })
  if ('response' in authorization)
    return authorization.response
  const path = attachmentPath(ctx.params.path)
  const oss = objectStore(ctx)
  if (!path || !oss)
    return syncJson({ error: 'invalid_attachment_path' }, 400)
  const body = ctx.request.body ?? new ArrayBuffer(0)
  const uploaded = await oss.put(syncAttachmentKey(authorization.userId, path), body, {
    httpMetadata: { contentType: ctx.request.headers.get('Content-Type') || 'application/octet-stream' },
    customMetadata: { uploadedAt: new Date().toISOString() },
  })
  if (!uploaded)
    return syncJson({ error: 'upload_failed' }, 502)
  return syncJson({
    path,
    size: uploaded.size,
    updatedAt: uploaded.uploaded.toISOString(),
    etag: uploaded.etag,
  }, 201)
}

export const DELETE: APIRoute = async (ctx) => {
  const authorization = await requireSyncOwner(ctx, { allowSession: true })
  if ('response' in authorization)
    return authorization.response
  const path = attachmentPath(ctx.params.path)
  const oss = objectStore(ctx)
  if (!path || !oss)
    return syncJson({ error: 'not_found' }, 404)
  await oss.delete(syncAttachmentKey(authorization.userId, path))
  return syncJson({ path })
}
