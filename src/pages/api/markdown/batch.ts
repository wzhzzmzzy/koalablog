import type { APIRoute } from 'astro'
import { MarkdownSource } from '@/db'
import { batchTrashByPaths, FileInputError, readAll, saveSyncedFile } from '@/db/markdown'
import { readCurrentRenderArtifact } from '@/db/render-artifact'
import { authInterceptor } from '@/lib/auth'
import { isRendererMode, RENDERER_MODE, type RendererMode } from '@/lib/files/types'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function requireAdmin(ctx: Parameters<APIRoute>[0]) {
  await authInterceptor(ctx)
  return ctx.locals.session.role === 'admin' ? null : json({ error: 'Unauthorized' }, 401)
}

function requestedSource(value: string | null) {
  if (value === 'post')
    return MarkdownSource.Post
  if (value === 'page')
    return MarkdownSource.Page
  if (value === 'wiki')
    return MarkdownSource.Wiki
  return MarkdownSource.Memo
}

async function artifactStatus(env: Env | undefined, file: { id: number, renderer: RendererMode }) {
  if (file.renderer === RENDERER_MODE.Markdown)
    return 'not_applicable' as const
  return await readCurrentRenderArtifact(env ?? {} as Env, file.id)
    ? 'current' as const
    : 'rebuild_required' as const
}

async function serializedFile(env: Env | undefined, file: {
  id: number
  path: string
  title: string
  renderer: RendererMode
  sourceHash: string
  revision: number
}) {
  return {
    id: file.id,
    path: file.path,
    title: file.title,
    renderer: file.renderer,
    sourceHash: file.sourceHash,
    artifactStatus: await artifactStatus(env, file),
    revision: file.revision,
  }
}

export const GET: APIRoute = async (ctx) => {
  const unauthorized = await requireAdmin(ctx)
  if (unauthorized)
    return unauthorized

  const files = await readAll(ctx.locals.runtime?.env, requestedSource(ctx.url.searchParams.get('source')))
  return json(await Promise.all(files.map(file => serializedFile(ctx.locals.runtime?.env, file))))
}

interface BatchSourceInput {
  id: number
  path: string
  renderer: RendererMode
  content: string
  private: boolean
  baseRevision: number
}

function parseBatchInput(body: unknown): { files?: BatchSourceInput[], error?: string } {
  if (!Array.isArray(body))
    return { error: 'Request body must be an array' }
  if (body.length === 0)
    return { error: 'Request body cannot be empty' }

  const files: BatchSourceInput[] = []
  for (const candidate of body) {
    if (!candidate || typeof candidate !== 'object')
      return { error: 'Every item must be a File input object' }
    const item = candidate as Record<string, unknown>
    if ('title' in item || 'subject' in item)
      return { error: 'File input must not include title' }
    if (['link', 'source', 'tags', 'outgoingLinks', 'remoteTruth', 'revision', 'createdAt', 'updatedAt', 'deletedAt'].some(field => field in item))
      return { error: 'File metadata is derived by the server' }
    if (Object.keys(item).some(field => !['id', 'path', 'renderer', 'content', 'private', 'baseRevision'].includes(field)))
      return { error: 'File input contains unsupported fields' }
    if ('renderer' in item && !isRendererMode(item.renderer))
      return { error: 'File renderer must be markdown or svelte' }
    if (typeof item.path !== 'string' || typeof item.content !== 'string')
      return { error: 'Every File input requires path and content strings' }
    if (!Number.isInteger(item.id) || (item.id as number) < 0 || !Number.isInteger(item.baseRevision) || (item.baseRevision as number) < 0)
      return { error: 'Every File input requires id and baseRevision integers' }
    if (typeof item.private !== 'boolean')
      return { error: 'File private must be a boolean' }
    files.push({
      id: item.id as number,
      path: item.path,
      renderer: isRendererMode(item.renderer) ? item.renderer : RENDERER_MODE.Markdown,
      content: item.content,
      private: item.private,
      baseRevision: item.baseRevision as number,
    })
  }
  return { files }
}

export const POST: APIRoute = async (ctx) => {
  const unauthorized = await requireAdmin(ctx)
  if (unauthorized)
    return unauthorized

  try {
    const parsed = parseBatchInput(await ctx.request.json())
    if (parsed.error)
      return json({ error: parsed.error }, 400)

    const results = await Promise.all(parsed.files!.map(file => saveSyncedFile(ctx.locals.runtime?.env, file)))
    if (results.some(result => result.status === 'conflict'))
      return json({ error: 'source_conflict', results }, 409)
    if (results.some(result => result.status === 'path_conflict'))
      return json({ error: 'path_conflict', results }, 409)
    if (results.some(result => result.status === 'not_found'))
      return json({ error: 'not_found', results }, 404)

    const files = results.map(result => result.status === 'saved' ? result.file : null).filter(file => file !== null)
    return json({
      success: true,
      count: files.length,
      results: await Promise.all(files.map(file => serializedFile(ctx.locals.runtime?.env, file))),
    })
  }
  catch (error) {
    if (error instanceof FileInputError)
      return json({ error: error.message, code: error.code }, 400)
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500)
  }
}

export const DELETE: APIRoute = async (ctx) => {
  const unauthorized = await requireAdmin(ctx)
  if (unauthorized)
    return unauthorized

  try {
    const body = await ctx.request.json()
    if (!Array.isArray(body))
      return json({ error: 'Request body must be an array of absolute Paths' }, 400)
    if (body.length === 0)
      return json({ error: 'Request body cannot be empty' }, 400)
    if (body.some(path => typeof path !== 'string'))
      return json({ error: 'Every item must be an absolute Path string' }, 400)

    const results = await batchTrashByPaths(ctx.locals.runtime?.env, body)
    return json({
      success: true,
      count: results.filter(result => result.status === 'trashed').length,
      results,
    })
  }
  catch (error) {
    if (error instanceof FileInputError)
      return json({ error: error.message, code: error.code }, 400)
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500)
  }
}
