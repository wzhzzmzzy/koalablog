import { randomUUID } from 'node:crypto'
import { unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createClient } from '@libsql/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { changePassword } from '@/actions/form/account'
import { createUser, findUserByUsername } from '@/db/user'
import { hashPassword, verifyPassword } from '@/lib/auth/password'
import { createSession, SESSION_COOKIE_NAME } from '@/lib/auth/session'

vi.mock('@/lib/auth', () => ({
  authInterceptor: async (ctx: any) => {
    const userId = Number(ctx.request.headers.get('X-Test-User')) || null
    ctx.locals.session = { userId, role: userId === 1 ? 'admin' : userId ? 'member' : '' }
  },
}))

const env = {} as Env

function useAccountDatabase() {
  let databasePath: string

  beforeEach(async () => {
    databasePath = join(tmpdir(), `koalablog-account-${randomUUID()}.db`)
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
    entries,
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

function createContext(userId: number, sessionKv: unknown, sessionId?: string) {
  return {
    cookies: {
      get: (key: string) => (key === SESSION_COOKIE_NAME && sessionId ? { value: sessionId } : undefined),
      set: vi.fn(),
      delete: vi.fn(),
    },
    request: new Request('https://koala.test/action', {
      headers: { 'X-Test-User': String(userId) },
    }),
    locals: {
      runtime: { env: { sessionKv } },
      session: { userId: null, role: '' },
    },
  } as any
}

async function createMember(username = 'member', password = 'old-password') {
  const { salt, hash } = await hashPassword(password)
  return createUser(env, { username, passwordHash: hash, passwordSalt: salt, role: 'member' })
}

describe('change password', () => {
  useAccountDatabase()

  it('requires the current password and revokes other Sessions on success', async () => {
    const user = await createMember()
    const sessionKv = memorySessionKv()
    const currentSession = await createSession(env, { userId: user.id, role: user.role }, sessionKv)
    const otherSession = await createSession(env, { userId: user.id, role: user.role }, sessionKv)

    const wrongCtx = createContext(user.id, sessionKv, currentSession)
    await expect(changePassword.orThrow.call(wrongCtx, { currentPassword: 'wrong', newPassword: 'new-password' }))
      .rejects
      .toMatchObject({ code: 'UNAUTHORIZED' })

    const ctx = createContext(user.id, sessionKv, currentSession)
    await expect(changePassword.orThrow.call(ctx, { currentPassword: 'old-password', newPassword: 'new-password' }))
      .resolves
      .toBeUndefined()

    const updated = await findUserByUsername(env, 'member')
    expect(await verifyPassword('new-password', { salt: updated!.passwordSalt, hash: updated!.passwordHash })).toBe(true)
    expect(await verifyPassword('old-password', { salt: updated!.passwordSalt, hash: updated!.passwordHash })).toBe(false)
    expect(sessionKv.entries.get(`session:${currentSession}`)).toBeDefined()
    expect(sessionKv.entries.get(`session:${otherSession}`)).toBeUndefined()
  })
})
