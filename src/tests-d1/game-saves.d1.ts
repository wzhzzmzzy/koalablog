import { Buffer } from 'node:buffer'
import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import { readByPath, saveSyncedFile } from '@/db/markdown'
import { resetD1ForOnboarding } from '@/db/onboarding'
import { SESSION_COOKIE_NAME } from '@/lib/auth/session'
import { digest, gameSaves, MAX_REQUEST_BYTES } from '@/lib/game-saves/storage'
import { publicObjectKey } from '@/lib/oss/public-key'
import { GET, POST, PUT } from '@/pages/api/game-saves/[game]/[slot]'
import initSql from '../../migrations/0000_init.sql?raw'
import userSql from '../../migrations/0002_user.sql?raw'

const path = '/game-saves/dragonball/current-7'
const saves = () => gameSaves(env, env.OSS, 7, 'dragonball', 'auto')
async function record(text = 'original checkpoint') {
  const bytes = new TextEncoder().encode(text).buffer
  return { schema: 1 as const, rom: 'a'.repeat(64), engine: 'emulatorjs-4.2.3-mgba-v1', id: crypto.randomUUID(), savedAt: Date.now(), sha256: await digest(bytes), data: Buffer.from(bytes).toString('base64') }
}
async function legacy(data: unknown, slot = 'auto', owner = 7, privateFile = true) {
  return saveSyncedFile(env, { id: 0, path: `/game-saves/dragonball/${slot === 'auto' ? 'current' : 'manual'}-7`, renderer: 'markdown', content: JSON.stringify(data), private: privateFile, baseRevision: 0, userId: owner })
}
function context(method = 'GET', input?: unknown, session: string | undefined = 'member', headers: Record<string, string> = {}, query = '') {
  const request = new Request(`https://koala.test/api/game-saves/dragonball/auto${query}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'Origin': 'https://koala.test', ...headers },
    ...(input === undefined ? {} : { body: JSON.stringify(input) }),
  })
  return {
    request,
    url: new URL(request.url),
    params: { game: 'dragonball', slot: 'auto' },
    cookies: { get: (key: string) => key === SESSION_COOKIE_NAME && session ? { value: session } : undefined },
    locals: { runtime: { env }, OSS: env.OSS, session: { userId: 999, role: 'admin' } },
  } as any
}
beforeEach(async () => {
  await resetD1ForOnboarding(env, [initSql, userSql])
  for (const [id, userId, expiresAt] of [['member', 7, Date.now() + 60000], ['other', 8, Date.now() + 60000], ['expired', 7, Date.now() - 1]] as const)
    await env.KOALA.put(`session:${id}`, JSON.stringify({ userId, role: 'member', expiresAt }))
})

describe('R2 checkpoints with D1 indexes', () => {
  it('stores only metadata in D1, verifies R2 bytes and supports ordinary member sessions', async () => {
    const checkpoint = await record()
    const response = await PUT(context('PUT', { expected: null, record: checkpoint }))
    expect(response.status).toBe(200)
    const state: any = await response.json()
    expect(state).toMatchObject({ exists: true, storage: 'r2', sha256: checkpoint.sha256 })
    const file = await readByPath(env, path)
    const index = JSON.parse(file!.content)
    expect(file).toMatchObject({ private: true, userId: 7 })
    expect(index.checkpoint).not.toHaveProperty('data')
    expect(file!.content).not.toContain(checkpoint.data)
    expect(await (await env.OSS.get(index.object))!.text()).toBe('original checkpoint')
    expect(publicObjectKey(index.object.replace('/', '_'))).toBeNull()
    const loaded = await GET(context('GET', undefined, 'member', {}, `?download=1&version=${state.version}`))
    expect(loaded.headers.get('Cache-Control')).toBe('private, no-store')
    expect(await loaded.json()).toMatchObject({ record: checkpoint, state })
    expect(await (await GET(context('GET', undefined, 'other'))).json()).toMatchObject({ exists: false, version: null })
  })

  it('round-trips a realistic 512 KiB checkpoint and the 2 MiB upper bound', async () => {
    for (const size of [512 * 1024, 2 * 1024 * 1024]) {
      const checkpoint = await record('x'.repeat(size))
      const previous = await saves().status()
      const next = await saves().upload(checkpoint, previous.version)
      expect((await saves().download(next.version)).record).toEqual(checkpoint)
      expect((await readByPath(env, path))!.content.length).toBeLessThan(1024)
    }
  })

  it.each(['auto', 'manual'])('migrates the existing D1 %s slot without changing any checkpoint field', async (slot) => {
    const checkpoint = await record()
    const old = { schema: 2, gameId: 'dragonball', slotId: slot, record: checkpoint }
    await legacy(old, slot)
    const service = gameSaves(env, env.OSS, 7, 'dragonball', slot)
    const prior = await service.status()
    const state = await service.migrate(prior.version)
    expect((await service.download(state.version)).record).toEqual(checkpoint)
    const index = JSON.parse((await readByPath(env, slot === 'auto' ? path : '/game-saves/dragonball/manual-7'))!.content)
    expect(JSON.parse(await (await env.OSS.get(index.legacyBackup))!.text())).toEqual(old)
    expect(await service.migrate(state.version)).toEqual(state)
  })

  it('decrypts the legacy R2 checkpoint and retains its encrypted object and full index backup', async () => {
    const checkpoint = await record()
    const rawKey = crypto.getRandomValues(new Uint8Array(32))
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const key = await crypto.subtle.importKey('raw', rawKey, 'AES-GCM', false, ['encrypt'])
    const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode('gba-dragonball-checkpoint-v1') }, key, new TextEncoder().encode(JSON.stringify(checkpoint)))
    const object = `oss/gba-dragonball/saves/${crypto.randomUUID()}.bin`
    await env.OSS.put(object, cipher)
    const old = { schema: 1, object, key: Buffer.from(rawKey).toString('base64'), iv: Buffer.from(iv).toString('base64'), savedAt: checkpoint.savedAt }
    await legacy(old)
    const prior = await saves().status()
    const response = await POST(context('POST', { expected: prior.version }))
    expect(response.status).toBe(200)
    const state: any = await response.json()
    expect((await saves().download(state.version)).record).toEqual(checkpoint)
    expect(await (await env.OSS.get(object))!.arrayBuffer()).toEqual(cipher)
    const index = JSON.parse((await readByPath(env, path))!.content)
    expect(JSON.parse(await (await env.OSS.get(index.legacyBackup))!.text())).toEqual(old)
  })

  it('leaves legacy content and revision intact when R2 fails or its readback is corrupt', async () => {
    await legacy({ schema: 2, gameId: 'dragonball', slotId: 'auto', record: await record() })
    const before = await readByPath(env, path)
    const state = await saves().status()
    for (const broken of [
      { get: env.OSS.get.bind(env.OSS), put: async () => { throw new Error('R2 offline') }, delete: env.OSS.delete.bind(env.OSS) },
      { get: async () => ({ body: new Uint8Array([0]).buffer, size: 1 }), put: async () => ({}), delete: env.OSS.delete.bind(env.OSS) },
    ]) {
      await expect(gameSaves(env, broken, 7, 'dragonball', 'auto').migrate(state.version)).rejects.toThrow()
      expect(await readByPath(env, path)).toEqual(before)
    }
    expect((await saves().download(state.version)).record.data).toBe(JSON.parse(before!.content).record.data)
  })

  it('rejects corrupted legacy data without changing it', async () => {
    await legacy({ schema: 2, gameId: 'dragonball', slotId: 'auto', record: { ...await record(), sha256: 'b'.repeat(64) } })
    const before = await readByPath(env, path)
    await expect(saves().migrate((await saves().status()).version)).rejects.toMatchObject({ status: 422 })
    expect(await readByPath(env, path)).toEqual(before)
  })

  it('accepts only one concurrent update and leaves the winning object readable', async () => {
    const initial = await saves().upload(await record('initial'), null)
    const results = await Promise.allSettled([saves().upload(await record('first'), initial.version), saves().upload(await record('second'), initial.version)])
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter(r => r.status === 'rejected')).toMatchObject([{ reason: { status: 409 } }])
    const current = await saves().status()
    expect(['first', 'second']).toContain(Buffer.from((await saves().download(current.version)).record.data, 'base64').toString())
    await expect(saves().download(initial.version)).rejects.toMatchObject({ status: 409 })
  })

  it.each([[8, true], [7, false]])('refuses a slot owned by %s / private=%s', async (owner, privateFile) => {
    await legacy({ schema: 2, gameId: 'dragonball', slotId: 'auto', record: await record() }, 'auto', owner, privateFile)
    const before = await readByPath(env, path)
    await expect(saves().status()).rejects.toMatchObject({ status: 409 })
    expect(await readByPath(env, path)).toEqual(before)
  })

  it.each(['missing', 'expired'])('rejects %s sessions without trusting middleware identity', async (session) => {
    expect((await GET(context('GET', undefined, session))).status).toBe(401)
    expect((await PUT(context('PUT', { expected: null, record: await record() }, session))).status).toBe(401)
  })

  it('rejects cross-site writes, path traversal, missing version, tampering and oversized bodies', async () => {
    const input = { expected: null, record: await record() }
    expect((await PUT(context('PUT', input, 'member', { Origin: 'https://evil.test' }))).status).toBe(403)
    const bad = context('PUT', input)
    bad.params.game = '../other'
    expect((await PUT(bad)).status).toBe(400)
    expect((await PUT(context('PUT', { record: input.record }))).status).toBe(400)
    expect((await PUT(context('PUT', { ...input, record: { ...input.record, sha256: 'c'.repeat(64) } }))).status).toBe(422)
    expect((await PUT(context('PUT', { data: 'x'.repeat(MAX_REQUEST_BYTES) }))).status).toBe(413)
    expect(await readByPath(env, path)).toBeUndefined()
  })
})
