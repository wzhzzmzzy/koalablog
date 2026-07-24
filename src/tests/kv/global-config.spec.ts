import { randomUUID } from 'node:crypto'
import { unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { globalConfig, putGlobalConfig, updateGlobalConfig } from '@/lib/kv'
import { createKvStore } from '@/lib/kv/local'
import { afterEach, describe, expect, it } from 'vitest'

const temporaryFiles: string[] = []

afterEach(async () => {
  await Promise.all(temporaryFiles.splice(0).map(path => unlink(path).catch(() => undefined)))
})

describe('global config persistence', () => {
  it('preserves unrelated scopes and sibling properties in Cloudflare KV', async () => {
    let stored = JSON.stringify({
      pageConfig: { title: 'Before', author: 'Amber' },
      auth: { adminKey: 'admin', guestKey: 'guest' },
      oss: {},
      font: { serif: 'Old Serif' },
      _runtime: { ready: true },
    })
    const env = {
      CF_PAGES: 1,
      KOALA: {
        get: async () => stored,
        put: async (_key: string, value: string) => {
          stored = value
        },
      },
    } as unknown as Env

    await updateGlobalConfig(env, {
      pageConfig: { title: 'After' },
    })

    expect(JSON.parse(stored)).toMatchObject({
      pageConfig: { title: 'After', author: 'Amber' },
      auth: { adminKey: 'admin', guestKey: 'guest' },
      font: { serif: 'Old Serif' },
    })
  })

  it('writes merged local config durably and survives a fresh store instance', async () => {
    const filePath = join(tmpdir(), `koalablog-config-${randomUUID()}.json`)
    temporaryFiles.push(filePath)
    const env = {} as Env
    const firstStore = createKvStore(filePath)

    await putGlobalConfig(env, {
      pageConfig: { title: 'Koala', author: 'Amber' },
      auth: { adminKey: 'admin' },
    }, firstStore)
    await updateGlobalConfig(env, {
      pageConfig: { title: 'Renamed' },
      auth: { guestKey: 'guest' },
    }, firstStore)

    const reloaded = await globalConfig(env, createKvStore(filePath))
    expect(reloaded).toMatchObject({
      pageConfig: { title: 'Renamed', author: 'Amber' },
      auth: { adminKey: 'admin', guestKey: 'guest' },
    })
  })

  it('preserves Source Hash maintenance state when ordinary Settings are saved', async () => {
    let stored = JSON.stringify({
      pageConfig: { title: 'Before' },
      auth: {},
      oss: {},
      font: {},
      maintenance: {
        sourceHashBackfill: {
          active: true,
          applicationCommit: 'abcdef1',
          startedAt: '2026-07-24T00:00:00.000Z',
        },
      },
      _runtime: { ready: true },
    })
    const env = {
      CF_PAGES: 1,
      KOALA: {
        get: async () => stored,
        put: async (_key: string, value: string) => {
          stored = value
        },
      },
    } as unknown as Env

    await updateGlobalConfig(env, { pageConfig: { title: 'After' } })

    expect(JSON.parse(stored)).toMatchObject({
      pageConfig: { title: 'After' },
      maintenance: {
        sourceHashBackfill: {
          active: true,
          applicationCommit: 'abcdef1',
        },
      },
    })
  })
})
