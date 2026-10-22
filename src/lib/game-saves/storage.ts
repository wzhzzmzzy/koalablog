import { Buffer } from 'node:buffer'
import { readByPath, saveSyncedFile } from '@/db/markdown'

export const MAX_CHECKPOINT_BYTES = 2 * 1024 * 1024
export const MAX_REQUEST_BYTES = Math.ceil(MAX_CHECKPOINT_BYTES / 3) * 4 + 4096
const enginePattern = /^[\w.-]{1,100}$/
const hashPattern = /^[a-f0-9]{64}$/
const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
export type Slot = 'auto' | 'manual'
export interface CheckpointMeta { schema: 1, rom: string, engine: string, id: string, savedAt: number, sha256: string }
export interface Checkpoint extends CheckpointMeta { data: string }
interface SaveIndex { schema: 3, kind: 'gba-save-index', userId: number, gameId: string, slotId: Slot, object: string, bytes: number, checkpoint: CheckpointMeta, legacyBackup?: string }
interface Objects {
  get: (key: string) => Promise<{ body: ReadableStream | ArrayBuffer, size: number } | null>
  put: (key: string, bytes: ArrayBuffer, options?: { httpMetadata: { contentType: string } }) => Promise<unknown>
  delete: (key: string) => Promise<unknown>
}
export class SaveError extends Error {
  constructor(public status: number, message: string) { super(message) }
}
function fail(status: number, message: string): never {
  throw new SaveError(status, message)
}
export function validateAddress(userId: number, game: string | undefined, slot: string | undefined) {
  if (!Number.isSafeInteger(userId) || userId <= 0 || typeof game !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(game) || game.length > 64 || !['auto', 'manual'].includes(slot || ''))
    fail(400, '无效的游戏或存档位置')
  return { userId, gameId: game, slotId: slot as Slot }
}
export function expectedVersion(value: unknown): string | null {
  if (value !== null && (typeof value !== 'string' || !/^[1-9]\d{0,15}:[1-9]\d{0,15}$/.test(value)))
    fail(400, '需要有效的存档版本')
  return value as string | null
}
function meta(value: any): CheckpointMeta {
  if (value?.schema !== 1 || typeof value.rom !== 'string' || typeof value.engine !== 'string' || typeof value.id !== 'string' || typeof value.sha256 !== 'string' || !hashPattern.test(value.rom) || !enginePattern.test(value.engine) || !uuidPattern.test(value.id) || !Number.isSafeInteger(value.savedAt) || value.savedAt < 0 || !hashPattern.test(value.sha256))
    fail(422, '存档格式不正确，原存档已保留')
  return { schema: 1, rom: value.rom, engine: value.engine, id: value.id, savedAt: value.savedAt, sha256: value.sha256 }
}
function decode(value: unknown, max = MAX_CHECKPOINT_BYTES) {
  if (typeof value !== 'string' || value.length > Math.ceil(max / 3) * 4 || !/^(?:[A-Z0-9+/]{4})*(?:[A-Z0-9+/]{2}==|[A-Z0-9+/]{3}=)?$/i.test(value))
    fail(422, '存档编码不正确')
  const buffer = Buffer.from(value, 'base64')
  if (!buffer.length || buffer.length > max || buffer.toString('base64') !== value)
    fail(422, '存档大小或编码不正确')
  return Uint8Array.from(buffer).buffer
}
export async function digest(bytes: ArrayBuffer) {
  return Buffer.from(await crypto.subtle.digest('SHA-256', bytes)).toString('hex')
}
export async function checkpoint(value: unknown) {
  const metadata = meta(value)
  const bytes = decode((value as Checkpoint).data)
  if (await digest(bytes) !== metadata.sha256)
    fail(422, '存档校验失败，原存档已保留')
  return { metadata, bytes }
}
export function gameSaves(env: Env, objects: Objects, userId: number, game: string, slot: string) {
  const address = validateAddress(userId, game, slot)
  const path = `/game-saves/${game}/${slot === 'auto' ? 'current' : 'manual'}-${userId}`
  // This root is deliberately outside every public OSS/Attachment namespace.
  const prefix = `game-saves/${userId}/${game}/${slot}/`
  const keyValid = (key: unknown, backup = false) => typeof key === 'string' && key.startsWith(prefix) && uuidPattern.test(key.slice(prefix.length, -(backup ? 5 : 4))) && key.endsWith(backup ? '.json' : '.bin')
  async function read() {
    const file = await readByPath(env, path)
    if (!file)
      return { file: null, data: null, version: null, exists: false, storage: 'empty' as const }
    if (file.userId !== userId || !file.private || file.renderer !== 'markdown' || file.deletedAt)
      fail(409, '存档位置已占用或不再私有，原数据已保留')
    let data: any
    try {
      data = JSON.parse(file.content)
    }
    catch { fail(422, '存档索引损坏，原数据已保留') }
    const version = `${file.id}:${file.revision}`
    if (data?.schema === 3 && data.kind === 'gba-save-index' && data.userId === userId && data.gameId === game && data.slotId === slot && keyValid(data.object) && Number.isInteger(data.bytes) && data.bytes > 0 && data.bytes <= MAX_CHECKPOINT_BYTES && (data.legacyBackup === undefined || keyValid(data.legacyBackup, true))) {
      meta(data.checkpoint)
      return { file, data: data as SaveIndex, version, exists: true, storage: 'r2' as const }
    }
    if (data?.schema === 2 && data.gameId === game && data.slotId === slot && (data.record === null || data.record?.schema === 1))
      return { file, data, version, exists: !!data.record, storage: 'legacy-d1' as const }
    if (slot === 'auto' && data?.schema === 1 && (data.object === null || (typeof data.object === 'string' && data.object.startsWith(`oss/gba-${game}/saves/`) && uuidPattern.test(data.object.slice(`oss/gba-${game}/saves/`.length, -4)) && data.object.endsWith('.bin'))))
      return { file, data, version, exists: !!data.object, storage: 'legacy-r2' as const }
    fail(422, '存档索引格式不兼容，原数据已保留')
  }
  type Snapshot = Awaited<ReturnType<typeof read>>
  const checkVersion = (value: Snapshot, expected: string | null) => {
    if (value.version !== expected)
      fail(409, '云端存档已变化，未覆盖；请刷新状态后重试')
  }
  function status(value: Snapshot) {
    const info = value.storage === 'r2' ? value.data.checkpoint : value.data?.record
    return { version: value.version, exists: value.exists, storage: value.storage, savedAt: info?.savedAt ?? value.data?.savedAt ?? null, sha256: info?.sha256 ?? null }
  }
  async function getObject(key: string, max: number) {
    const object = await objects.get(key)
    if (!object || object.size > max)
      fail(502, '存档文件不可用，索引和原数据已保留')
    const bytes = await new Response(object.body).arrayBuffer()
    if (bytes.byteLength !== object.size || bytes.byteLength > max)
      fail(502, '存档文件不完整')
    return bytes
  }
  async function loadRecord(value: Snapshot): Promise<Checkpoint> {
    if (!value.exists)
      fail(404, '云端还没有存档')
    if (value.storage === 'r2') {
      const bytes = await getObject(value.data.object, MAX_CHECKPOINT_BYTES)
      if (bytes.byteLength !== value.data.bytes || await digest(bytes) !== value.data.checkpoint.sha256)
        fail(502, '存档文件校验失败')
      return { ...meta(value.data.checkpoint), data: Buffer.from(bytes).toString('base64') }
    }
    let record = value.data.record
    if (value.storage === 'legacy-r2') {
      try {
        const rawKey = decode(value.data.key, 32)
        const iv = decode(value.data.iv, 12)
        if (rawKey.byteLength !== 32 || iv.byteLength !== 12)
          fail(422, '旧存档密钥无效')
        const key = await crypto.subtle.importKey('raw', rawKey, 'AES-GCM', false, ['decrypt'])
        const cipher = await getObject(value.data.object, MAX_REQUEST_BYTES + 1024)
        const bytes = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(`gba-${game}-checkpoint-v1`) }, key, cipher)
        record = JSON.parse(new TextDecoder().decode(bytes))
      }
      catch { fail(422, '旧 R2 存档解密失败，原存档已保留') }
    }
    const checked = await checkpoint(record)
    return { ...checked.metadata, data: Buffer.from(checked.bytes).toString('base64') }
  }
  async function verifiedPut(key: string, bytes: ArrayBuffer, contentType: string) {
    const result = await objects.put(key, bytes, { httpMetadata: { contentType } })
    if (!result)
      fail(502, '上传存档失败，原存档已保留')
    const stored = await getObject(key, bytes.byteLength)
    if (await digest(stored) !== await digest(bytes))
      fail(502, '上传校验失败，原存档已保留')
  }
  async function store(value: Snapshot, record: Checkpoint) {
    const checked = await checkpoint(record)
    let legacyBackup = value.storage === 'r2' ? value.data.legacyBackup : undefined
    if (value.file && value.storage !== 'r2' && value.exists) {
      // Preserve the complete old Source, including legacy encryption metadata.
      legacyBackup = `${prefix}${crypto.randomUUID()}.json`
      await verifiedPut(legacyBackup, new TextEncoder().encode(value.file.content).buffer as ArrayBuffer, 'application/json')
    }
    const object = `${prefix}${crypto.randomUUID()}.bin`
    await verifiedPut(object, checked.bytes, 'application/octet-stream')
    const index: SaveIndex = { schema: 3, kind: 'gba-save-index', ...address, object, bytes: checked.bytes.byteLength, checkpoint: checked.metadata, ...(legacyBackup ? { legacyBackup } : {}) }
    // An ambiguous database/network failure must not delete a possibly committed object.
    const result = await saveSyncedFile(env, { id: value.file?.id ?? 0, path, renderer: 'markdown', content: JSON.stringify(index), private: true, baseRevision: value.file?.revision ?? 0, userId })
    if (result.status !== 'saved') {
      await objects.delete(object).catch(() => {})
      fail(409, '云端存档已变化，未覆盖；请刷新状态后重试')
    }
    // Only discard the replaced v3 object after a successful index commit.
    // Keep the verified legacy backup and the original encrypted object.
    if (value.storage === 'r2')
      await objects.delete(value.data.object).catch(() => {})
    return status({ file: result.file, data: index, version: `${result.file.id}:${result.file.revision}`, exists: true, storage: 'r2' })
  }
  return {
    async status() { return status(await read()) },
    async download(expected: string | null) {
      const value = await read()
      checkVersion(value, expected)
      const record = await loadRecord(value)
      checkVersion(await read(), value.version)
      return { record, state: status(value) }
    },
    async upload(record: Checkpoint, expected: string | null) {
      const value = await read()
      checkVersion(value, expected)
      return store(value, record)
    },
    async migrate(expected: string | null) {
      const value = await read()
      checkVersion(value, expected)
      if (!value.exists || value.storage === 'r2')
        return status(value)
      const record = await loadRecord(value)
      checkVersion(await read(), value.version)
      return store(value, record)
    },
  }
}
