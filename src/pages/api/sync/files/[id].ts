import type { APIRoute } from 'astro'
import { FileInputError, readActiveByIdForOwner, saveSyncedFile, trashByIdForOwner } from '@/db/markdown'
import { isRendererMode } from '@/lib/files/types'
import { requireSyncOwner, syncFileManifest, syncJson } from '@/lib/sync/api'

function fileId(input: string | undefined) {
  const value = Number(input)
  return Number.isSafeInteger(value) && value > 0 ? value : null
}

function parseUpdate(input: unknown) {
  if (!input || typeof input !== 'object')
    return { error: 'Request body must be an object' }
  const value = input as Record<string, unknown>
  if (Object.keys(value).some(key => !['path', 'renderer', 'content', 'baseRevision'].includes(key)))
    return { error: 'File input contains unsupported fields' }
  if (typeof value.path !== 'string' || typeof value.content !== 'string' || !Number.isInteger(value.baseRevision))
    return { error: 'File input requires path, content, and baseRevision' }
  if (!isRendererMode(value.renderer))
    return { error: 'File renderer must be markdown or svelte' }
  return { value: { path: value.path, content: value.content, renderer: value.renderer, baseRevision: value.baseRevision as number } }
}

export const GET: APIRoute = async (ctx) => {
  const authorization = await requireSyncOwner(ctx)
  if ('response' in authorization)
    return authorization.response
  const id = fileId(ctx.params.id)
  if (!id)
    return syncJson({ error: 'not_found' }, 404)
  const file = await readActiveByIdForOwner(ctx.locals.runtime?.env ?? {} as Env, id, authorization.userId)
  return file ? syncJson({ file: { ...syncFileManifest(file), content: file.content } }) : syncJson({ error: 'not_found' }, 404)
}

export const PUT: APIRoute = async (ctx) => {
  const authorization = await requireSyncOwner(ctx)
  if ('response' in authorization)
    return authorization.response
  const id = fileId(ctx.params.id)
  if (!id)
    return syncJson({ error: 'not_found' }, 404)
  try {
    const parsed = parseUpdate(await ctx.request.json())
    if ('error' in parsed)
      return syncJson({ error: parsed.error }, 400)
    const current = await readActiveByIdForOwner(ctx.locals.runtime?.env ?? {} as Env, id, authorization.userId)
    if (!current)
      return syncJson({ error: 'not_found' }, 404)
    const result = await saveSyncedFile(ctx.locals.runtime?.env ?? {} as Env, {
      id,
      path: parsed.value.path,
      renderer: parsed.value.renderer,
      content: parsed.value.content,
      private: current.private,
      baseRevision: parsed.value.baseRevision,
      userId: authorization.userId,
    })
    if (result.status === 'saved')
      return syncJson({ file: syncFileManifest(result.file) })
    if (result.status === 'conflict')
      return syncJson({ error: 'source_conflict', file: syncFileManifest(result.current) }, 409)
    if (result.status === 'path_conflict')
      return syncJson({ error: 'path_conflict', path: result.path }, 409)
    return syncJson({ error: 'not_found' }, 404)
  }
  catch (error) {
    if (error instanceof FileInputError)
      return syncJson({ error: error.message, code: error.code }, 400)
    return syncJson({ error: error instanceof Error ? error.message : 'Unknown error' }, 500)
  }
}

export const DELETE: APIRoute = async (ctx) => {
  const authorization = await requireSyncOwner(ctx)
  if ('response' in authorization)
    return authorization.response
  const id = fileId(ctx.params.id)
  if (!id)
    return syncJson({ error: 'not_found' }, 404)
  let body: { baseRevision?: unknown }
  try {
    body = await ctx.request.json()
  }
  catch {
    return syncJson({ error: 'Request body must include baseRevision' }, 400)
  }
  if (!Number.isInteger(body?.baseRevision))
    return syncJson({ error: 'Request body must include baseRevision' }, 400)
  const result = await trashByIdForOwner(ctx.locals.runtime?.env ?? {} as Env, id, authorization.userId, body.baseRevision as number)
  if (result.status === 'saved')
    return syncJson({ file: syncFileManifest(result.file) })
  if (result.status === 'conflict')
    return syncJson({ error: 'source_conflict', file: syncFileManifest(result.current) }, 409)
  return syncJson({ error: 'not_found' }, 404)
}
