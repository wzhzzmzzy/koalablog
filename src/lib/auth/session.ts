// #if !CF_PAGES
import { storage } from '@/lib/kv/local'
// #endif

export const SESSION_COOKIE_NAME = 'koala-session'
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7

export type UserRole = 'admin' | 'member'

export interface SessionRecord {
  userId: number
  role: UserRole
  expiresAt: number
}

export interface SessionKv {
  get: (key: string) => Promise<unknown>
  set: (key: string, value: unknown, ttlSeconds?: number) => Promise<void>
  delete: (key: string) => Promise<void>
}

function cloudflareSessionKv(env: Env): SessionKv {
  return {
    get: async (key) => {
      const raw = await env.KOALA.get(key)
      return raw ? JSON.parse(raw) : undefined
    },
    set: async (key, value, ttlSeconds) => {
      await env.KOALA.put(key, JSON.stringify(value), ttlSeconds ? { expirationTtl: ttlSeconds } : undefined)
    },
    delete: key => env.KOALA.delete(key),
  }
}

function resolveSessionKv(env?: Env): SessionKv {
  const override = (env as (Env & { sessionKv?: SessionKv }) | undefined)?.sessionKv
  if (override)
    return override
  if (env?.CF_PAGES && env.KOALA)
    return cloudflareSessionKv(env)
  // #if !CF_PAGES
  return {
    get: key => storage.get(key),
    set: async (key, value) => {
      await storage.set(key, value)
      await storage.sync()
    },
    delete: async (key) => {
      await storage.delete(key)
      await storage.sync()
    },
  }
  // #endif
  throw new Error('Session KV is not available')
}

function sessionKey(id: string) {
  return `session:${id}`
}

function sessionIndexKey(userId: number) {
  return `session-index:${userId}`
}

export async function createSession(
  env: Env | undefined,
  input: { userId: number, role: UserRole },
  kv?: SessionKv,
): Promise<string> {
  const store = kv ?? resolveSessionKv(env)
  const id = crypto.randomUUID()
  const record: SessionRecord = {
    userId: input.userId,
    role: input.role,
    expiresAt: Date.now() + SESSION_TTL_SECONDS * 1000,
  }
  await store.set(sessionKey(id), record, SESSION_TTL_SECONDS)

  const indexKey = sessionIndexKey(input.userId)
  const index = ((await store.get(indexKey)) as string[] | undefined) ?? []
  await store.set(indexKey, [...index, id])
  return id
}

export async function readSession(env: Env | undefined, id: string, kv?: SessionKv): Promise<SessionRecord | null> {
  const store = kv ?? resolveSessionKv(env)
  const record = (await store.get(sessionKey(id))) as SessionRecord | undefined
  if (!record || typeof record.expiresAt !== 'number' || record.expiresAt <= Date.now())
    return null
  return record
}

export async function deleteSession(env: Env | undefined, id: string, kv?: SessionKv): Promise<void> {
  const store = kv ?? resolveSessionKv(env)
  const record = (await store.get(sessionKey(id))) as SessionRecord | undefined
  await store.delete(sessionKey(id))
  if (record) {
    const indexKey = sessionIndexKey(record.userId)
    const index = ((await store.get(indexKey)) as string[] | undefined) ?? []
    await store.set(indexKey, index.filter(entry => entry !== id))
  }
}

export async function deleteSessionsForUser(
  env: Env | undefined,
  userId: number,
  kv?: SessionKv,
  exceptId?: string,
): Promise<void> {
  const store = kv ?? resolveSessionKv(env)
  const indexKey = sessionIndexKey(userId)
  const index = ((await store.get(indexKey)) as string[] | undefined) ?? []
  const survivors: string[] = []
  for (const id of index) {
    if (exceptId && id === exceptId)
      survivors.push(id)
    else
      await store.delete(sessionKey(id))
  }
  await store.set(indexKey, survivors)
}

const prodCookieParams = import.meta.env.MODE === 'development'
  ? {}
  : { secure: true }

interface SessionCookieContext {
  cookies: {
    set: (key: string, value: string, options: Record<string, unknown>) => void
    delete: (key: string, options: Record<string, unknown>) => void
  }
}

export function setSessionCookie(ctx: SessionCookieContext, sessionId: string) {
  ctx.cookies.set(SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    expires: new Date(Date.now() + SESSION_TTL_SECONDS * 1000),
    ...prodCookieParams,
  })
}

export function clearSessionCookie(ctx: SessionCookieContext) {
  ctx.cookies.delete(SESSION_COOKIE_NAME, { path: '/' })
}
