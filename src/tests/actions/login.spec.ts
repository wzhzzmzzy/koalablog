import { randomUUID } from 'node:crypto'
import { unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createClient } from '@libsql/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { login, logout } from '@/actions/form/login'
import { createUser, findUserByUsername } from '@/db/user'
import { hashPassword, verifyPassword } from '@/lib/auth/password'
import { SESSION_COOKIE_NAME } from '@/lib/auth/session'

const env = {} as Env

function useLoginDatabase() {
  let databasePath: string

  beforeEach(async () => {
    databasePath = join(tmpdir(), `koalablog-login-${randomUUID()}.db`)
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
    entries,
    get: async (key: string) => entries.get(key),
    set: async (key: string, value: unknown) => {
      entries.set(key, value)
    },
    delete: async (key: string) => {
      entries.delete(key)
    },
  }
}

function createContext(sessionKv: ReturnType<typeof memorySessionKv>, sessionId?: string) {
  return {
    cookies: {
      get: (key: string) => (key === SESSION_COOKIE_NAME && sessionId ? { value: sessionId } : undefined),
      set: vi.fn(),
      delete: vi.fn(),
    },
    locals: {
      runtime: { env: { sessionKv } },
    },
  } as any
}

describe('login action', () => {
  useLoginDatabase()

  it('creates a KV Session and sets the session cookie on valid credentials', async () => {
    const { salt, hash } = await hashPassword('hunter2')
    await createUser(env, { username: 'admin', passwordHash: hash, passwordSalt: salt, role: 'admin' })
    const sessionKv = memorySessionKv()
    const ctx = createContext(sessionKv)

    await expect(login.orThrow.call(ctx, { username: 'admin', password: 'hunter2' })).resolves.toBeUndefined()

    expect(ctx.cookies.set).toHaveBeenCalledWith(
      SESSION_COOKIE_NAME,
      expect.any(String),
      expect.objectContaining({ httpOnly: true, path: '/' }),
    )
    const sessionId = ctx.cookies.set.mock.calls[0][1]
    expect(sessionKv.entries.get(`session:${sessionId}`)).toMatchObject({ userId: 1, role: 'admin' })
  })

  it('rejects a wrong password without creating a Session', async () => {
    const { salt, hash } = await hashPassword('hunter2')
    await createUser(env, { username: 'admin', passwordHash: hash, passwordSalt: salt, role: 'admin' })
    const ctx = createContext(memorySessionKv())

    await expect(login.orThrow.call(ctx, { username: 'admin', password: 'wrong' })).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    expect(ctx.cookies.set).not.toHaveBeenCalled()
  })

  it('upgrades a legacy password hash after a successful login', async () => {
    const legacy = {
      salt: '0123456789abcdeffedcba9876543210',
      hash: '798192cf692bf26be52c662c96c0947de44cab6690d1026b22a31474a545a1fd',
    }
    await createUser(env, { username: 'legacy-admin', passwordHash: legacy.hash, passwordSalt: legacy.salt, role: 'admin' })

    await expect(login.orThrow.call(createContext(memorySessionKv()), { username: 'legacy-admin', password: 'hunter2' }))
      .resolves
      .toBeUndefined()

    const upgraded = await findUserByUsername(env, 'legacy-admin')
    expect(upgraded?.passwordHash).not.toBe(legacy.hash)
    expect(await verifyPassword('hunter2', { salt: upgraded!.passwordSalt, hash: upgraded!.passwordHash })).toBe(true)
  })
})

describe('logout action', () => {
  useLoginDatabase()

  it('deletes only the current Session and clears the cookie', async () => {
    const sessionKv = memorySessionKv()
    const loginCtx = createContext(sessionKv)
    const { salt, hash } = await hashPassword('hunter2')
    await createUser(env, { username: 'admin', passwordHash: hash, passwordSalt: salt, role: 'admin' })
    await login.orThrow.call(loginCtx, { username: 'admin', password: 'hunter2' })
    const sessionId = loginCtx.cookies.set.mock.calls[0][1]

    const ctx = createContext(sessionKv, sessionId)
    await expect(logout.orThrow.call(ctx, {})).resolves.toBeUndefined()

    expect(sessionKv.entries.get(`session:${sessionId}`)).toBeUndefined()
    expect(ctx.cookies.delete).toHaveBeenCalledWith(SESSION_COOKIE_NAME, { path: '/' })
  })
})
