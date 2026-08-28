import { SYNC_ATTACHMENT_ROOT } from '@/lib/sync/api'

const CACHE_KEY = 'koala:owner-attachment-usage:v1'
const CACHE_TTL_MS = 5 * 60 * 1000

interface ObjectStorageListResult {
  objects: Array<{ key: string, size: number }>
  truncated: boolean
  cursor?: string
}

export interface ObjectStorageLister {
  list: (options?: { prefix?: string, cursor?: string }) => Promise<ObjectStorageListResult>
}

export interface OwnerAttachmentUsage {
  userId: number
  attachmentCount: number
  bytes: number
}

export interface OwnerAttachmentUsageSnapshot {
  users: OwnerAttachmentUsage[]
  generatedAt: string
  expiresAt: number
}

interface CacheStorage {
  get: (key: string) => Promise<string | null>
  put: (key: string, value: string, options?: { expirationTtl?: number }) => Promise<void>
}

function ownerIdFromKey(key: string) {
  if (!key.startsWith(SYNC_ATTACHMENT_ROOT))
    return null

  const [ownerId, ...path] = key.slice(SYNC_ATTACHMENT_ROOT.length).split('/')
  if (!/^[1-9]\d*$/.test(ownerId) || path.length === 0 || path.every(segment => segment.length === 0))
    return null

  const parsed = Number(ownerId)
  return Number.isSafeInteger(parsed) ? parsed : null
}

export async function listOwnerAttachmentUsage(storage: ObjectStorageLister) {
  const usage = new Map<number, Omit<OwnerAttachmentUsage, 'userId'>>()
  const seenCursors = new Set<string>()
  let cursor: string | undefined

  do {
    const page = await storage.list({ prefix: SYNC_ATTACHMENT_ROOT, cursor })
    for (const object of page.objects) {
      const userId = ownerIdFromKey(object.key)
      if (userId === null)
        continue

      const current = usage.get(userId) ?? { attachmentCount: 0, bytes: 0 }
      current.attachmentCount += 1
      current.bytes += Math.max(0, object.size)
      usage.set(userId, current)
    }

    if (!page.truncated)
      break
    if (!page.cursor || seenCursors.has(page.cursor))
      throw new Error('Object storage returned an invalid pagination cursor')
    seenCursors.add(page.cursor)
    cursor = page.cursor
  } while (true)

  return [...usage.entries()]
    .map(([userId, value]) => ({ userId, ...value }))
    .sort((left, right) => left.userId - right.userId)
}

function validSnapshot(value: unknown, now: number): value is OwnerAttachmentUsageSnapshot {
  if (!value || typeof value !== 'object')
    return false
  const snapshot = value as Partial<OwnerAttachmentUsageSnapshot>
  return typeof snapshot.generatedAt === 'string'
    && typeof snapshot.expiresAt === 'number'
    && snapshot.expiresAt > now
    && Array.isArray(snapshot.users)
    && snapshot.users.every(item => item
      && Number.isSafeInteger(item.userId)
      && Number.isSafeInteger(item.attachmentCount)
      && typeof item.bytes === 'number')
}

export class OwnerAttachmentUsageService {
  private memoryCache?: OwnerAttachmentUsageSnapshot
  private inFlight?: Promise<OwnerAttachmentUsageSnapshot>

  constructor(private ttlMs = CACHE_TTL_MS) {}

  async read(env: Env, storage: ObjectStorageLister, now = Date.now()) {
    if (this.memoryCache && this.memoryCache.expiresAt > now)
      return this.memoryCache

    const cacheStorage = env?.CF_PAGES && env.KOALA ? env.KOALA as CacheStorage : undefined
    if (cacheStorage) {
      try {
        const cached = await cacheStorage.get(CACHE_KEY)
        if (cached) {
          const parsed: unknown = JSON.parse(cached)
          if (validSnapshot(parsed, now)) {
            this.memoryCache = parsed
            return parsed
          }
        }
      }
      catch (error) {
        console.warn('Owner Attachment usage cache read failed', error)
      }
    }

    this.inFlight ??= this.refresh(cacheStorage, storage, now)
    try {
      return await this.inFlight
    }
    finally {
      this.inFlight = undefined
    }
  }

  private async refresh(cacheStorage: CacheStorage | undefined, storage: ObjectStorageLister, now: number) {
    const snapshot: OwnerAttachmentUsageSnapshot = {
      users: await listOwnerAttachmentUsage(storage),
      generatedAt: new Date(now).toISOString(),
      expiresAt: now + this.ttlMs,
    }
    this.memoryCache = snapshot

    if (cacheStorage) {
      try {
        await cacheStorage.put(CACHE_KEY, JSON.stringify(snapshot), {
          expirationTtl: Math.max(60, Math.ceil(this.ttlMs / 1000)),
        })
      }
      catch (error) {
        console.warn('Owner Attachment usage cache write failed', error)
      }
    }

    return snapshot
  }
}

const ownerAttachmentUsageService = new OwnerAttachmentUsageService()

export function readOwnerAttachmentUsage(env: Env, storage: ObjectStorageLister) {
  return ownerAttachmentUsageService.read(env, storage)
}

export function formatStorageSize(bytes: number) {
  if (bytes < 1000)
    return `${bytes} B`

  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unitIndex = -1
  do {
    value /= 1000
    unitIndex += 1
  } while (value >= 1000 && unitIndex < units.length - 1)

  return `${new Intl.NumberFormat('en', { maximumFractionDigits: value < 10 ? 2 : 1 }).format(value)} ${units[unitIndex]}`
}
