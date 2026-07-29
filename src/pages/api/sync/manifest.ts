import type { APIRoute } from 'astro'
import { readActiveByOwner } from '@/db/markdown'
import { requireSyncOwner, syncAttachmentPrefix, syncFileManifest, syncJson } from '@/lib/sync/api'

interface AttachmentStore {
  list: (options?: { prefix?: string, cursor?: string }) => Promise<{
    objects: Array<{ key: string, size: number, uploaded: Date, etag?: string }>
    truncated: boolean
    cursor?: string
  }>
}

async function listAllAttachments(oss: AttachmentStore, prefix: string) {
  const objects: Array<{ path: string, size: number, updatedAt: string, etag?: string }> = []
  let cursor: string | undefined
  do {
    const result = await oss.list({ prefix, cursor })
    for (const object of result.objects) {
      if (object.key.startsWith(prefix)) {
        objects.push({
          path: object.key.slice(prefix.length),
          size: object.size,
          updatedAt: object.uploaded.toISOString(),
          etag: object.etag,
        })
      }
    }
    cursor = result.truncated ? result.cursor : undefined
  } while (cursor)
  return objects
}

export const GET: APIRoute = async (ctx) => {
  const authorization = await requireSyncOwner(ctx)
  if ('response' in authorization)
    return authorization.response

  const files = await readActiveByOwner(ctx.locals.runtime?.env ?? {} as Env, authorization.userId)
  const oss = ctx.locals.OSS || ctx.locals.runtime?.env.OSS
  const attachments = oss ? await listAllAttachments(oss, syncAttachmentPrefix(authorization.userId)) : []
  return syncJson({
    files: files.map(syncFileManifest),
    attachments,
  })
}
