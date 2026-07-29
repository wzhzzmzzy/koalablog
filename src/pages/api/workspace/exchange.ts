import type { APIRoute } from 'astro'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { readActiveByOwner, saveSyncedFile } from '@/db/markdown'
import { authInterceptor } from '@/lib/auth'
import { fileDiskPath, fileFromDiskPath } from '@/lib/files/disk'
import { attachmentPath, syncAttachmentKey, syncAttachmentPrefix } from '@/lib/sync/api'

interface AttachmentStore {
  list: (options?: { prefix?: string, cursor?: string }) => Promise<{ objects: Array<{ key: string }>, truncated: boolean, cursor?: string }>
  get: (key: string) => Promise<{ arrayBuffer?: () => Promise<ArrayBuffer>, body?: ArrayBuffer } | null>
  put: (key: string, body: ArrayBuffer | Uint8Array, options?: unknown) => Promise<unknown>
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

async function owner(ctx: Parameters<APIRoute>[0]) {
  await authInterceptor(ctx)
  return Number.isInteger(ctx.locals.session?.userId) ? ctx.locals.session.userId! : null
}

function store(ctx: Parameters<APIRoute>[0]) {
  return (ctx.locals.OSS || ctx.locals.runtime?.env.OSS) as AttachmentStore | undefined
}

function safeArchivePath(path: string) {
  return path && !path.startsWith('/') && !path.split('/').some(segment => !segment || segment === '.' || segment === '..')
}

async function attachmentNames(oss: AttachmentStore, prefix: string) {
  const names: string[] = []
  let cursor: string | undefined
  do {
    const listed = await oss.list({ prefix, cursor })
    for (const object of listed.objects) {
      if (object.key.startsWith(prefix))
        names.push(object.key.slice(prefix.length))
    }
    cursor = listed.truncated ? listed.cursor : undefined
  } while (cursor)
  return names
}

export const GET: APIRoute = async (ctx) => {
  const userId = await owner(ctx)
  if (!userId)
    return json({ error: 'Unauthorized' }, 401)
  const entries: Record<string, Uint8Array> = {}
  const files = await readActiveByOwner(ctx.locals.runtime?.env ?? {} as Env, userId)
  for (const file of files)
    entries[fileDiskPath(file.path, file.renderer)] = strToU8(file.content)
  const oss = store(ctx)
  if (oss) {
    const prefix = syncAttachmentPrefix(userId)
    for (const path of await attachmentNames(oss, prefix)) {
      const object = await oss.get(`${prefix}${path}`)
      if (!object)
        continue
      const bytes = object.arrayBuffer ? new Uint8Array(await object.arrayBuffer()) : new Uint8Array(object.body!)
      entries[`attachments/${path}`] = bytes
    }
  }
  return new Response(zipSync(entries, { level: 6 }), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename="koalablog-content.zip"',
    },
  })
}

export const POST: APIRoute = async (ctx) => {
  const userId = await owner(ctx)
  if (!userId)
    return json({ error: 'Unauthorized' }, 401)
  let entries: Record<string, Uint8Array>
  try {
    entries = unzipSync(new Uint8Array(await ctx.request.arrayBuffer()))
  }
  catch {
    return json({ error: 'Invalid content exchange archive' }, 400)
  }
  const existing = new Set((await readActiveByOwner(ctx.locals.runtime?.env ?? {} as Env, userId)).map(file => file.path))
  const summary = {
    created: [] as string[],
    skippedExisting: [] as string[],
    skippedInvalid: [] as string[],
    rebuildRequired: [] as string[],
    attachments: { created: [] as string[], skippedExisting: [] as string[], skippedInvalid: [] as string[] },
  }
  const oss = store(ctx)
  const existingAttachments = oss ? new Set(await attachmentNames(oss, syncAttachmentPrefix(userId))) : new Set<string>()
  for (const [path, content] of Object.entries(entries)) {
    if (path.startsWith('attachments/')) {
      const attachment = attachmentPath(path.slice('attachments/'.length))
      if (!attachment || !oss) {
        summary.attachments.skippedInvalid.push(path)
        continue
      }
      if (existingAttachments.has(attachment)) {
        summary.attachments.skippedExisting.push(attachment)
        continue
      }
      await oss.put(syncAttachmentKey(userId, attachment), content, { httpMetadata: { contentType: 'application/octet-stream' } })
      summary.attachments.created.push(attachment)
      existingAttachments.add(attachment)
      continue
    }
    if (!safeArchivePath(path) || path.startsWith('.koala/')) {
      summary.skippedInvalid.push(path)
      continue
    }
    try {
      const source = fileFromDiskPath(path)
      if (existing.has(source.path)) {
        summary.skippedExisting.push(source.path)
        continue
      }
      const result = await saveSyncedFile(ctx.locals.runtime?.env ?? {} as Env, {
        id: 0,
        path: source.path,
        renderer: source.renderer,
        content: strFromU8(content),
        private: true,
        baseRevision: 0,
        userId,
      })
      if (result.status === 'saved') {
        summary.created.push(source.path)
        existing.add(source.path)
        if (source.renderer === 'svelte')
          summary.rebuildRequired.push(source.path)
      }
      else if (result.status === 'path_conflict') {
        summary.skippedExisting.push(source.path)
      }
    }
    catch {
      summary.skippedInvalid.push(path)
    }
  }
  return json(summary, 201)
}
