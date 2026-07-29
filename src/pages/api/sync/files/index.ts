import type { APIRoute } from 'astro'
import { FileInputError, saveSyncedFile } from '@/db/markdown'
import { isRendererMode, RENDERER_MODE } from '@/lib/files/types'
import { requireSyncOwner, syncFileManifest, syncJson } from '@/lib/sync/api'

function parseCreate(input: unknown) {
  if (!input || typeof input !== 'object')
    return { error: 'Request body must be an object' }
  const value = input as Record<string, unknown>
  if (Object.keys(value).some(key => !['path', 'renderer', 'content'].includes(key)))
    return { error: 'File input contains unsupported fields' }
  if (typeof value.path !== 'string' || typeof value.content !== 'string')
    return { error: 'File input requires path and content strings' }
  if (value.renderer !== undefined && !isRendererMode(value.renderer))
    return { error: 'File renderer must be markdown or svelte' }
  return { value: { path: value.path, content: value.content, renderer: value.renderer ?? RENDERER_MODE.Markdown } }
}

export const POST: APIRoute = async (ctx) => {
  const authorization = await requireSyncOwner(ctx)
  if ('response' in authorization)
    return authorization.response
  try {
    const parsed = parseCreate(await ctx.request.json())
    if ('error' in parsed)
      return syncJson({ error: parsed.error }, 400)
    const result = await saveSyncedFile(ctx.locals.runtime?.env ?? {} as Env, {
      id: 0,
      path: parsed.value.path,
      renderer: parsed.value.renderer,
      content: parsed.value.content,
      private: true,
      baseRevision: 0,
      userId: authorization.userId,
    })
    if (result.status === 'path_conflict')
      return syncJson({ error: 'path_conflict', path: result.path }, 409)
    if (result.status !== 'saved')
      return syncJson({ error: result.status }, 404)
    return syncJson({ file: syncFileManifest(result.file) }, 201)
  }
  catch (error) {
    if (error instanceof FileInputError)
      return syncJson({ error: error.message, code: error.code }, 400)
    return syncJson({ error: error instanceof Error ? error.message : 'Unknown error' }, 500)
  }
}
