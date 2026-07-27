import type { SessionKv } from '@/lib/auth/session'
import { describe, expect, it } from 'vitest'
import { createSession, deleteSession, deleteSessionsForUser, readSession, SESSION_TTL_SECONDS } from '@/lib/auth/session'

function memorySessionKv(): SessionKv & { entries: Map<string, unknown> } {
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

const env = {} as Env

describe('session lifecycle over KV', () => {
  it('creates, reads, and deletes a Session identified by an opaque id', async () => {
    const kv = memorySessionKv()

    const id = await createSession(env, { userId: 7, role: 'member' }, kv)

    expect(id).toMatch(/^[0-9a-f-]{36}$/)
    expect(await readSession(env, id, kv)).toMatchObject({ userId: 7, role: 'member' })

    await deleteSession(env, id, kv)
    expect(await readSession(env, id, kv)).toBeNull()
  })

  it('rejects a Session past its expiry', async () => {
    const kv = memorySessionKv()
    const id = await createSession(env, { userId: 7, role: 'member' }, kv)
    const key = `session:${id}`
    const record = kv.entries.get(key) as { expiresAt: number }
    kv.entries.set(key, { ...record, expiresAt: Date.now() - 1000 })

    expect(await readSession(env, id, kv)).toBeNull()
    expect(record.expiresAt).toBeLessThanOrEqual(Date.now() + SESSION_TTL_SECONDS * 1000)
  })

  it('revokes every Session of a User except a surviving one', async () => {
    const kv = memorySessionKv()
    const first = await createSession(env, { userId: 7, role: 'member' }, kv)
    const second = await createSession(env, { userId: 7, role: 'member' }, kv)
    const other = await createSession(env, { userId: 8, role: 'admin' }, kv)

    await deleteSessionsForUser(env, 7, kv, first)

    expect(await readSession(env, first, kv)).toMatchObject({ userId: 7 })
    expect(await readSession(env, second, kv)).toBeNull()
    expect(await readSession(env, other, kv)).toMatchObject({ userId: 8 })
  })

  it('revokes Sessions from concurrent logins that a lost-update index would miss', async () => {
    const kv = memorySessionKv()
    const [current, concurrent] = await Promise.all([
      createSession(env, { userId: 7, role: 'member' }, kv),
      createSession(env, { userId: 7, role: 'member' }, kv),
    ])

    await deleteSessionsForUser(env, 7, kv, current)

    expect(await readSession(env, current, kv)).toMatchObject({ userId: 7 })
    expect(await readSession(env, concurrent, kv)).toBeNull()
  })
})
