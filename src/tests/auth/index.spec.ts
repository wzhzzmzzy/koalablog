import { randomUUID } from 'node:crypto'
import { unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createClient } from '@libsql/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApiToken, createUser } from '@/db/user'
import { authInterceptor } from '@/lib/auth'
import { hashApiToken } from '@/lib/auth/api-token'
import { createSession, SESSION_COOKIE_NAME } from '@/lib/auth/session'

const env = {} as Env

function useAuthDatabase() {
  let databasePath: string

  beforeEach(async () => {
    databasePath = join(tmpdir(), `koalablog-auth-${randomUUID()}.db`)
    vi.stubEnv('SQLITE_URL', `file:${databasePath}`)

    const client = createClient({ url: `file:${databasePath}` })
    await client.executeMultiple(`
      CREATE TABLE user (
        id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        username text NOT NULL,
        passwordHash text NOT NULL,
        passwordSalt text NOT NULL,
        role text DEFAULT 'member' NOT NULL,
        createdAt integer DEFAULT (unixepoch()) NOT NULL,
        updatedAt integer DEFAULT (unixepoch()) NOT NULL
      );
      CREATE UNIQUE INDEX user_username_unique ON user (username);
      CREATE TABLE api_token (
        id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        userId integer NOT NULL REFERENCES user(id) ON DELETE cascade,
        tokenHash text NOT NULL,
        label text,
        createdAt integer DEFAULT (unixepoch()) NOT NULL
      );
      CREATE UNIQUE INDEX api_token_hash_unique ON api_token (tokenHash);
    `)
    client.close()
  })

  afterEach(async () => {
    vi.unstubAllEnvs()
    await unlink(databasePath).catch(() => undefined)
  })
}

function memorySessionKv() {
  const entries = new Map<string, unknown>()
  return {
    get: async (key: string) => entries.get(key),
    set: async (key: string, value: unknown) => {
      entries.set(key, value)
    },
    delete: async (key: string) => {
      entries.delete(key)
    },
    list: async (prefix: string) => [...entries.keys()].filter(key => key.startsWith(prefix)),
  }
}

function createContext({ authorization, sessionId, sessionKv }: { authorization?: string, sessionId?: string, sessionKv: unknown }) {
  return {
    cookies: {
      get: (key: string) => (key === SESSION_COOKIE_NAME && sessionId ? { value: sessionId } : undefined),
      set: vi.fn(),
      delete: vi.fn(),
    },
    request: new Request('https://koala.test/dashboard', {
      headers: authorization ? { Authorization: authorization } : {},
    }),
    locals: {
      runtime: { env: { sessionKv } },
    },
  } as any
}

describe('authInterceptor', () => {
  useAuthDatabase()

  it('resolves a bearer API Token to its owning User', async () => {
    const admin = await createUser(env, { username: 'admin', passwordHash: 'x', passwordSalt: 'y', role: 'admin' })
    await createApiToken(env, { userId: admin.id, tokenHash: await hashApiToken('secret-token') })

    const ctx = createContext({ authorization: 'Bearer secret-token', sessionKv: memorySessionKv() })
    await authInterceptor(ctx)

    expect(ctx.locals.session).toEqual({ userId: admin.id, role: 'admin' })
  })

  it('resolves a Session cookie to the Session owner', async () => {
    const sessionKv = memorySessionKv()
    const sessionId = await createSession(env, { userId: 42, role: 'member' }, sessionKv)

    const ctx = createContext({ sessionId, sessionKv })
    await authInterceptor(ctx)

    expect(ctx.locals.session).toEqual({ userId: 42, role: 'member' })
  })

  it('rejects unknown bearer tokens and expired Sessions to anonymous', async () => {
    const ctx = createContext({ authorization: 'Bearer wrong', sessionId: 'missing', sessionKv: memorySessionKv() })
    await authInterceptor(ctx)

    expect(ctx.locals.session).toEqual({ userId: null, role: '' })
  })
})
