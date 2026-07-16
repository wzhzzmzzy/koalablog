import type { APIRoute } from 'astro'
import { MarkdownSource } from '@/db'
import { batchTrashByPaths, batchUpsert, FileInputError, readAll } from '@/db/markdown'
import { authInterceptor } from '@/lib/auth'

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

export const GET: APIRoute = async (ctx) => {
  const unauthorized = await requireAdmin(ctx)
  if (unauthorized)
    return unauthorized

  const files = await readAll(ctx.locals.runtime?.env, requestedSource(ctx.url.searchParams.get('source')))
  return json(files.map(file => ({
    id: file.id,
    path: file.path,
    title: file.title,
    revision: file.revision,
  })))
}

interface BatchSourceInput {
  path: string
  content: string
  private?: boolean
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
    if ('link' in item || 'source' in item || 'tags' in item || 'outgoingLinks' in item)
      return { error: 'File metadata is derived by the server' }
    if (typeof item.path !== 'string' || typeof item.content !== 'string')
      return { error: 'Every File input requires path and content strings' }
    if (item.private !== undefined && typeof item.private !== 'boolean')
      return { error: 'File private must be a boolean' }
    files.push({ path: item.path, content: item.content, private: item.private as boolean | undefined })
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

    const results = await batchUpsert(ctx.locals.runtime?.env, parsed.files!)
    return json({
      success: true,
      count: results.length,
      results: results.map(file => ({
        id: file.id,
        path: file.path,
        title: file.title,
        revision: file.revision,
      })),
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
