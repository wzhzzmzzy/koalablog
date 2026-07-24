import { randomUUID } from 'node:crypto'
import { unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApiToken as createApiTokenAction, createUser as createUserAction, resetPassword, revokeApiToken } from '@/actions/form/account'
import { createApiToken, createUser, findApiTokenByHash, findUserByUsername } from '@/db/user'
import { hashApiToken } from '@/lib/auth/api-token'
import { hashPassword, verifyPassword } from '@/lib/auth/password'
import { createClient } from '@libsql/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth', () => ({
  authInterceptor: async (ctx: any) => {
    const userId = Number(ctx.request.headers.get('X-Test-User')) || null
    ctx.locals.session = { userId, role: userId === 1 ? 'admin' : userId ? 'member' : '' }
  },
}))

const env = {} as Env

function useManagementDatabase() {
  let databasePath: string

  beforeEach(async () => {
    databasePath = join(tmpdir(), `koalablog-management-${randomUUID()}.db`)
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

function createContext(userId: number) {
  return {
    request: new Request('https://koala.test/action', {
      headers: { 'X-Test-User': String(userId) },
    }),
    locals: {
      runtime: { env: {} },
      session: { userId: null, role: '' },
    },
  } as any
}

describe('api token management', () => {
  useManagementDatabase()

  it('creates a Token shown once and revokes only the owner\'s own Tokens', async () => {
    const { salt, hash } = await hashPassword('pw')
    const owner = await createUser(env, { username: 'owner', passwordHash: hash, passwordSalt: salt, role: 'member' })
    const other = await createUser(env, { username: 'other', passwordHash: hash, passwordSalt: salt, role: 'member' })

    const created = await createApiTokenAction.orThrow.call(createContext(owner.id), { label: 'sync-script' })
    expect(created).toMatchObject({ label: 'sync-script' })
    expect(typeof created.token).toBe('string')
    expect(await findApiTokenByHash(env, await hashApiToken(created.token))).toMatchObject({ userId: owner.id })

    const foreign = await createApiToken(env, { userId: other.id, tokenHash: await hashApiToken('foreign') })
    await expect(revokeApiToken.orThrow.call(createContext(owner.id), { id: foreign.id }))
      .rejects
      .toMatchObject({ code: 'NOT_FOUND' })

    const own = await createApiToken(env, { userId: owner.id, tokenHash: await hashApiToken('own') })
    await expect(revokeApiToken.orThrow.call(createContext(owner.id), { id: own.id })).resolves.toBeUndefined()
    expect(await findApiTokenByHash(env, await hashApiToken('own'))).toBeUndefined()
  })
})

describe('user management', () => {
  useManagementDatabase()

  it('lets the Admin create users and reset passwords without the old one', async () => {
    const { salt, hash } = await hashPassword('admin-pw')
    const admin = await createUser(env, { username: 'admin', passwordHash: hash, passwordSalt: salt, role: 'admin' })
    const { salt: msalt, hash: mhash } = await hashPassword('member-pw')
    const member = await createUser(env, { username: 'member', passwordHash: mhash, passwordSalt: msalt, role: 'member' })

    await expect(createUserAction.orThrow.call(createContext(member.id), { username: 'blocked', password: 'x', role: 'member' }))
      .rejects
      .toMatchObject({ code: 'UNAUTHORIZED' })

    const created = await createUserAction.orThrow.call(createContext(admin.id), { username: 'friend', password: 'initial-pw', role: 'member' })
    expect(created).toMatchObject({ username: 'friend', role: 'member' })
    expect(await verifyPassword('initial-pw', { salt: created.passwordSalt, hash: created.passwordHash })).toBe(true)

    await expect(createUserAction.orThrow.call(createContext(admin.id), { username: 'friend', password: 'x', role: 'member' }))
      .rejects
      .toMatchObject({ code: 'CONFLICT' })

    await expect(resetPassword.orThrow.call(createContext(admin.id), { userId: member.id, password: 'reset-pw' }))
      .resolves
      .toBeUndefined()
    const updated = await findUserByUsername(env, 'member')
    expect(await verifyPassword('reset-pw', { salt: updated!.passwordSalt, hash: updated!.passwordHash })).toBe(true)

    await expect(resetPassword.orThrow.call(createContext(member.id), { userId: admin.id, password: 'hijack' }))
      .rejects
      .toMatchObject({ code: 'UNAUTHORIZED' })
  })
})
