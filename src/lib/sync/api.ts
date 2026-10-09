import type { APIRoute } from 'astro'
import { authInterceptor } from '@/lib/auth'

export function syncJson(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export type SyncAuthorization = { response: Response } | { userId: number }

export async function requireSyncOwner(ctx: Parameters<APIRoute>[0], { allowSession = false } = {}): Promise<SyncAuthorization> {
  const authorization = ctx.request.headers.get('Authorization')
  const useSession = allowSession && !ctx.request.headers.has('Authorization')
  if (!useSession && !authorization?.startsWith('Bearer '))
    return { response: syncJson({ error: 'Unauthorized' }, 401) }

  await authInterceptor(ctx, { allowSession: useSession })
  const userId = ctx.locals.session?.userId
  if (!Number.isInteger(userId))
    return { response: syncJson({ error: 'Unauthorized' }, 401) }

  if (useSession) {
    const origin = ctx.request.headers.get('Origin')
    const site = ctx.request.headers.get('Sec-Fetch-Site')
    const writes = !['GET', 'HEAD'].includes(ctx.request.method)
    // Cookie writes need an explicit same-origin proof, regardless of MIME type.
    if (((origin !== null || writes) && origin !== ctx.url.origin)
      || (site !== null && site !== 'same-origin' && site !== 'none')) {
      return { response: syncJson({ error: 'Cross-origin Session request forbidden' }, 403) }
    }
  }
  return { userId: userId! }
}

export function attachmentPath(input: string | undefined) {
  if (!input || input.startsWith('/') || input.split('/').some(segment => !segment || segment === '.' || segment === '..'))
    return null
  return input
}

export const SYNC_ATTACHMENT_ROOT = 'sync-attachments/'

export function syncAttachmentPrefix(userId: number) {
  return `${SYNC_ATTACHMENT_ROOT}${userId}/`
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
