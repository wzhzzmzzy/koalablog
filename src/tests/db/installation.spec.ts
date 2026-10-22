import type { LocalConfigStorage } from '@/lib/kv'
import { randomUUID } from 'node:crypto'
import { unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createClient } from '@libsql/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { initializeExistingInstallation } from '@/db/installation'
import { readTemplateCatalog, replaceTemplateCatalog } from '@/db/template-catalog'
import { countUsers, createUser, findApiTokenByHash } from '@/db/user'
import { hashApiToken } from '@/lib/auth/api-token'
import initSql from '../../../migrations/0000_init.sql?raw'
import userSql from '../../../migrations/0002_user.sql?raw'

const env = {} as Env
let databasePath: string

function storage(ready: boolean, auth: Record<string, string> = {}) {
  const entries = new Map<string, unknown>([['_KoalaConfig_', { _runtime: { ready }, auth }]])
  return {
    get: async (key: string) => entries.get(key),
    set: async (key: string, value: unknown) => { entries.set(key, value) },
    sync: async () => {},
  } satisfies LocalConfigStorage
}

beforeEach(async () => {
  databasePath = join(tmpdir(), `koala-installation-${randomUUID()}.db`)
  vi.stubEnv('SQLITE_URL', `file:${databasePath}`)
  const client = createClient({ url: `file:${databasePath}` })
  await client.executeMultiple(`${initSql}\n${userSql}`)
  client.close()
})

afterEach(async () => {
  vi.unstubAllEnvs()
  await unlink(databasePath).catch(() => undefined)
})

describe('explicit existing-installation initialization', () => {
  it('leaves fresh sites to onboarding without writing a catalog or User', async () => {
    await expect(initializeExistingInstallation(env, storage(false))).rejects.toThrow('onboarding')
    expect(await readTemplateCatalog(env)).toEqual({ status: 'absent' })
    expect(await countUsers(env)).toBe(0)
  })

  it('migrates an existing legacy site only when explicitly invoked and can be repeated', async () => {
    const configStorage = storage(true, { adminKey: 'legacy-password', bearerToken: 'legacy-token' })
    await initializeExistingInstallation(env, configStorage)
    const catalog = await readTemplateCatalog(env)
    expect(catalog.status).toBe('ready')
    expect(await countUsers(env)).toBe(1)
    expect(await findApiTokenByHash(env, await hashApiToken('legacy-token'))).toBeDefined()
    await initializeExistingInstallation(env, configStorage)
    expect(await countUsers(env)).toBe(1)
    expect(await readTemplateCatalog(env)).toEqual(catalog)
  })

  it('preserves an intentionally empty catalog and existing Users', async () => {
    await createUser(env, { username: 'existing', passwordHash: 'hash', passwordSalt: 'salt', role: 'member' })
    const configStorage = storage(true)
    await initializeExistingInstallation(env, configStorage)
    await replaceTemplateCatalog(env, 1, [])
    const before = await readTemplateCatalog(env)
    await initializeExistingInstallation(env, configStorage)
    expect(await readTemplateCatalog(env)).toEqual(before)
    expect(await countUsers(env)).toBe(1)
  })

  it('reports an incomplete ready installation instead of silently succeeding', async () => {
    await expect(initializeExistingInstallation(env, storage(true))).rejects.toThrow('No User or legacy admin key')
  })
})
