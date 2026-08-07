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
  list: (prefix: string) => Promise<string[]>
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
    list: async (prefix) => {
      const keys: string[] = []
      let cursor: string | undefined
      do {
        const page = await env.KOALA.list({ prefix, cursor })
        keys.push(...page.keys.map(entry => entry.name))
        cursor = page.list_complete ? undefined : page.cursor
      } while (cursor)
      return keys
    },
  }
}

function resolveSessionKv(env?: Env): SessionKv {
  const override = (env as (Env & { sessionKv?: SessionKv }) | undefined)?.sessionKv
  if (override)
    return override
  if (env?.CF_PAGES && env.KOALA)
    return cloudflareSessionKv(env)
  // #if !CF_PAGES
  if (!env?.CF_PAGES) {
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
      list: async (prefix) => {
        await storage.init()
        return Object.keys(storage.storage).filter(key => key.startsWith(prefix))
      },
    }
  }
  // #endif
  throw new Error('Session KV is not available')
}

const SESSION_KEY_PREFIX = 'session:'

function sessionKey(id: string) {
  return `${SESSION_KEY_PREFIX}${id}`
}

// Legacy per-user index keys are no longer written; they are only purged
// during revocation so deployments upgrading from the indexed scheme do not
// leave stale entries behind.
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
  await store.delete(sessionKey(id))
}

export async function deleteSessionsForUser(
  env: Env | undefined,
  userId: number,
  kv?: SessionKv,
  exceptId?: string,
): Promise<void> {
  const store = kv ?? resolveSessionKv(env)
  const keys = await store.list(SESSION_KEY_PREFIX)
  await Promise.all(keys.map(async (key) => {
    if (exceptId && key === sessionKey(exceptId))
      return
    const record = (await store.get(key)) as SessionRecord | undefined
    if (record?.userId === userId)
      await store.delete(key)
  }))
  await store.delete(sessionIndexKey(userId))
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
