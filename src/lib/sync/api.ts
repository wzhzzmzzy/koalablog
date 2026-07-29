import type { APIRoute } from 'astro'
import { authInterceptor } from '@/lib/auth'

export function syncJson(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export type SyncAuthorization = { response: Response } | { userId: number }

export async function requireSyncOwner(ctx: Parameters<APIRoute>[0]): Promise<SyncAuthorization> {
  await authInterceptor(ctx)
  const authorization = ctx.request.headers.get('Authorization')
  const userId = ctx.locals.session?.userId
  if (!authorization?.startsWith('Bearer ') || !Number.isInteger(userId))
    return { response: syncJson({ error: 'Unauthorized' }, 401) }
  return { userId: userId! }
}

export function attachmentPath(input: string | undefined) {
  if (!input || input.startsWith('/') || input.split('/').some(segment => !segment || segment === '.' || segment === '..'))
    return null
  return input
}

export function syncAttachmentPrefix(userId: number) {
  return `sync-attachments/${userId}/`
}

export function syncAttachmentKey(userId: number, path: string) {
  return `${syncAttachmentPrefix(userId)}${path}`
}

export function syncFileManifest(file: {
  id: number
  path: string
  renderer: string
  sourceHash: string
  revision: number
  updatedAt: Date
}) {
  return {
    id: file.id,
    path: file.path,
    renderer: file.renderer,
    sourceHash: file.sourceHash,
    revision: file.revision,
    updatedAt: file.updatedAt.toISOString(),
  }
}
