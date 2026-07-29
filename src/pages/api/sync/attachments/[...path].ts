import type { APIRoute } from 'astro'
import { attachmentPath, requireSyncOwner, syncAttachmentKey, syncJson } from '@/lib/sync/api'

function objectStore(ctx: Parameters<APIRoute>[0]) {
  return ctx.locals.OSS || ctx.locals.runtime?.env.OSS
}

function contentType(object: { httpMetadata?: { contentType?: string } }) {
  return object.httpMetadata?.contentType || 'application/octet-stream'
}

export const GET: APIRoute = async (ctx) => {
  const authorization = await requireSyncOwner(ctx)
  if ('response' in authorization)
    return authorization.response
  const path = attachmentPath(ctx.params.path)
  const oss = objectStore(ctx)
  if (!path || !oss)
    return syncJson({ error: 'not_found' }, 404)
  const object = await oss.get(syncAttachmentKey(authorization.userId, path))
  if (!object)
    return syncJson({ error: 'not_found' }, 404)
  const body = 'arrayBuffer' in object ? await object.arrayBuffer() : object.body
  return new Response(body, { headers: { 'Content-Type': contentType(object) } })
}

export const PUT: APIRoute = async (ctx) => {
  const authorization = await requireSyncOwner(ctx)
  if ('response' in authorization)
    return authorization.response
  const path = attachmentPath(ctx.params.path)
  const oss = objectStore(ctx)
  if (!path || !oss)
    return syncJson({ error: 'invalid_attachment_path' }, 400)
  const body = await ctx.request.arrayBuffer()
  const uploaded = await oss.put(syncAttachmentKey(authorization.userId, path), body, {
    httpMetadata: { contentType: ctx.request.headers.get('Content-Type') || 'application/octet-stream' },
    customMetadata: { uploadedAt: new Date().toISOString(), size: String(body.byteLength) },
  })
  return syncJson({
    path,
    size: uploaded?.size ?? body.byteLength,
    updatedAt: uploaded?.uploaded?.toISOString?.() ?? new Date().toISOString(),
    etag: uploaded?.etag,
  }, 201)
}

export const DELETE: APIRoute = async (ctx) => {
  const authorization = await requireSyncOwner(ctx)
  if ('response' in authorization)
    return authorization.response
  const path = attachmentPath(ctx.params.path)
  const oss = objectStore(ctx)
  if (!path || !oss)
    return syncJson({ error: 'not_found' }, 404)
  await oss.delete(syncAttachmentKey(authorization.userId, path))
  return syncJson({ path })
}
