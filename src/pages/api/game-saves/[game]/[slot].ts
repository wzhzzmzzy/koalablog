import type { APIContext, APIRoute } from 'astro'
import { expectedVersion, gameSaves, MAX_REQUEST_BYTES, SaveError, validateAddress } from '@/lib/game-saves/storage'
import { requireSyncOwner } from '@/lib/sync/api'

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store', 'Vary': 'Cookie, Authorization', 'X-Content-Type-Options': 'nosniff' } })
}
async function body(ctx: APIContext) {
  if (ctx.request.headers.get('Content-Type')?.split(';')[0].trim() !== 'application/json')
    throw new SaveError(415, '需要 JSON 请求')
  const reader = ctx.request.body?.getReader()
  if (!reader)
    throw new SaveError(400, '请求内容为空')
  let length = 0
  const chunks: Uint8Array[] = []
  for (;;) {
    const { value, done } = await reader.read()
    if (done)
      break
    length += value.length
    if (length > MAX_REQUEST_BYTES) {
      await reader.cancel()
      throw new SaveError(413, '存档过大')
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes))
  }
  catch { throw new SaveError(400, '无效的 JSON 请求') }
}
async function handle(ctx: APIContext, mode: 'status' | 'upload' | 'migrate') {
  try {
    const auth = await requireSyncOwner(ctx, { allowSession: true })
    if ('response' in auth)
      return json({ error: auth.response.status === 401 ? '请先登录' : '不允许跨站请求' }, auth.response.status)
    const address = validateAddress(auth.userId, ctx.params.game, ctx.params.slot)
    const objects = ctx.locals.OSS || ctx.locals.runtime?.env.OSS
    if (!objects)
      return json({ error: '存档存储暂不可用' }, 503)
    const saves = gameSaves(ctx.locals.runtime?.env || {} as Env, objects, address.userId, address.gameId, address.slotId)
    if (mode === 'status') {
      if (ctx.url.searchParams.get('download') === '1')
        return json(await saves.download(expectedVersion(ctx.url.searchParams.get('version'))))
      return json(await saves.status())
    }
    const input = await body(ctx)
    const expected = expectedVersion(input?.expected)
    return json(mode === 'upload' ? await saves.upload(input.record, expected) : await saves.migrate(expected))
  }
  catch (error) {
    if (error instanceof SaveError)
      return json({ error: error.message }, error.status)
    return json({ error: '云存档暂不可用，原存档已保留' }, 503)
  }
}
export const GET: APIRoute = ctx => handle(ctx, 'status')
export const PUT: APIRoute = ctx => handle(ctx, 'upload')
export const POST: APIRoute = ctx => handle(ctx, 'migrate')
