import type { LocalConfigStorage } from '@/lib/kv'
import { randomUUID } from 'node:crypto'
import { unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createClient } from '@libsql/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { onboarding } from '@/actions/form/onboarding'
import { countUsers, findUserByUsername } from '@/db/user'
import { verifyPassword } from '@/lib/auth/password'
import { SESSION_COOKIE_NAME } from '@/lib/auth/session'
import { globalConfig } from '@/lib/kv'

const hoisted = vi.hoisted(() => {
  const data: Record<string, unknown> = {}
  return {
    data,
    store: {
      get: async (key: string) => data[key],
      set: async (key: string, value: unknown) => {
        data[key] = value
      },
      sync: async () => undefined,
    } as LocalConfigStorage,
  }
})

vi.mock('@/lib/kv', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/kv')>()
  return {
    ...original,
    globalConfig: vi.fn((env: Env | undefined, storage?: LocalConfigStorage) => original.globalConfig(env, storage ?? hoisted.store)),
    putGlobalConfig: vi.fn((env: Env, patch: Partial<import('@/lib/kv').GlobalConfig>, storage?: LocalConfigStorage) =>
      original.putGlobalConfig(env, patch, storage ?? hoisted.store)),
  }
})

const env = {} as Env

function useOnboardingDatabase() {
  let databasePath: string

  beforeEach(async () => {
    databasePath = join(tmpdir(), `koalablog-onboarding-${randomUUID()}.db`)
    vi.stubEnv('SQLITE_URL', `file:${databasePath}`)
    for (const key of Object.keys(hoisted.data))
      delete hoisted.data[key]

    const client = createClient({ url: `file:${databasePath}` })
    await client.executeMultiple(`
      CREATE TABLE creation_template_catalog (
        key text PRIMARY KEY NOT NULL,
        schemaVersion integer NOT NULL,
        revision integer NOT NULL,
        payload text NOT NULL,
        createdAt integer DEFAULT (unixepoch()) NOT NULL,
        updatedAt integer DEFAULT (unixepoch()) NOT NULL
      );
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

function createContext() {
  return {
    cookies: {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    },
    locals: {
      runtime: { env: {} },
    },
  } as any
}

describe('user-creating onboarding', () => {
  useOnboardingDatabase()

  it('creates the first Admin, starts a Session, and marks the site ready without key config', async () => {
    const ctx = createContext()

    await expect(onboarding.orThrow.call(ctx, { blogTitle: 'Koala Blog', username: 'admin', password: 'secret-pw' }))
      .resolves
      .toBeUndefined()

    const admin = await findUserByUsername(env, 'admin')
    expect(admin).toMatchObject({ username: 'admin', role: 'admin' })
    expect(await verifyPassword('secret-pw', { salt: admin!.passwordSalt, hash: admin!.passwordHash })).toBe(true)

    expect(ctx.cookies.set).toHaveBeenCalledWith(
      SESSION_COOKIE_NAME,
      expect.any(String),
      expect.objectContaining({ httpOnly: true, path: '/' }),
    )

    const config = await globalConfig(env, hoisted.store)
    expect(config._runtime.ready).toBe(true)
    expect(config.pageConfig.title).toBe('Koala Blog')
    expect(config.auth.adminKey).toBeUndefined()
    expect(config.auth.bearerToken).toBeUndefined()

    await expect(onboarding.orThrow.call(createContext(), { blogTitle: 'Again', username: 'second', password: 'secret-pw' }))
      .rejects
      .toMatchObject({ code: 'CONFLICT' })
  })

  it('rejects a concurrent first-Admin attempt even when the ready flag was not yet written', async () => {
    await expect(onboarding.orThrow.call(createContext(), { blogTitle: 'Koala Blog', username: 'admin', password: 'secret-pw' }))
      .resolves
      .toBeUndefined()

    // Simulate a second request that observed ready=false before the first
    // request wrote it, as happens when two onboards race.
    for (const key of Object.keys(hoisted.data))
      delete hoisted.data[key]

    await expect(onboarding.orThrow.call(createContext(), { blogTitle: 'Race', username: 'intruder', password: 'secret-pw' }))
      .rejects
      .toMatchObject({ code: 'CONFLICT' })

    expect(await countUsers(env)).toBe(1)
    expect(await findUserByUsername(env, 'intruder')).toBeUndefined()
  })
})
