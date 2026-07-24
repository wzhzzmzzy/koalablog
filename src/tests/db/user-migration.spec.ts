import type { LocalConfigStorage } from '@/lib/kv'
import { randomUUID } from 'node:crypto'
import { unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { batchAdd, justReadAll } from '@/db/markdown'
import { countUsers, findApiTokenByHash, findUserByUsername } from '@/db/user'
import { ensureUserMigration } from '@/db/user-migration'
import { hashApiToken } from '@/lib/auth/api-token'
import { verifyPassword } from '@/lib/auth/password'
import { globalConfig } from '@/lib/kv'
import { createClient } from '@libsql/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const env = {} as Env

function useUserMigrationDatabase() {
  let databasePath: string

  beforeEach(async () => {
    databasePath = join(tmpdir(), `koalablog-user-migration-${randomUUID()}.db`)
    vi.stubEnv('SQLITE_URL', `file:${databasePath}`)

    const client = createClient({ url: `file:${databasePath}` })
    await client.executeMultiple(`
      CREATE TABLE markdown (
        id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        source integer NOT NULL,
        path text NOT NULL,
        title text NOT NULL,
        renderer text DEFAULT 'markdown' NOT NULL,
        content text NOT NULL,
        sourceHash text NOT NULL,
        tags text,
        incoming_links text,
        outgoing_links text,
        private integer DEFAULT false NOT NULL,
        remoteTruth integer DEFAULT false NOT NULL,
        revision integer DEFAULT 1 NOT NULL,
        createdAt integer DEFAULT (unixepoch()) NOT NULL,
        updatedAt integer DEFAULT (unixepoch()) NOT NULL,
        deletedAt integer,
        userId integer
      );
      CREATE UNIQUE INDEX markdown_active_path_unique ON markdown (path) WHERE deletedAt IS NULL;
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

function memoryConfigStorage(auth: Record<string, string | undefined>): LocalConfigStorage & { dump: () => Record<string, unknown> } {
  const store: Record<string, unknown> = {
    _KoalaConfig_: { oss: {}, pageConfig: {}, auth, _runtime: { ready: true } },
  }
  return {
    get: async (key: string) => store[key],
    set: async (key: string, value: unknown) => {
      store[key] = value
    },
    sync: async () => undefined,
    dump: () => store,
  }
}

describe('first User migration', () => {
  useUserMigrationDatabase()

  it('migrates the admin key into the first User and retires key-based auth config', async () => {
    await batchAdd(env, [
      { path: '/post/a', renderer: 'markdown', content: '' },
      { path: '/memo/b', renderer: 'markdown', content: '' },
    ])
    const storage = memoryConfigStorage({ adminKey: 'old-admin-key', guestKey: 'guest-pass', bearerToken: 'bearer-abc' })

    await ensureUserMigration(env, { configStorage: storage })

    const admin = await findUserByUsername(env, 'admin')
    expect(admin).toMatchObject({ username: 'admin', role: 'admin' })
    expect(await verifyPassword('old-admin-key', { salt: admin!.passwordSalt, hash: admin!.passwordHash })).toBe(true)

    const files = await justReadAll(env)
    expect(files.length).toBe(2)
    expect(files.every(file => file.userId === admin!.id)).toBe(true)

    const token = await findApiTokenByHash(env, await hashApiToken('bearer-abc'))
    expect(token).toMatchObject({ userId: admin!.id })

    const config = await globalConfig(env, storage)
    expect(config.auth.adminKey).toBeUndefined()
    expect(config.auth.guestKey).toBeUndefined()
    expect(config.auth.bearerToken).toBeUndefined()

    await ensureUserMigration(env, { configStorage: storage })
    expect(await countUsers(env)).toBe(1)
  })

  it('does nothing on a fresh install without an admin key', async () => {
    const storage = memoryConfigStorage({})

    await ensureUserMigration(env, { configStorage: storage })

    expect(await countUsers(env)).toBe(0)
  })
})
