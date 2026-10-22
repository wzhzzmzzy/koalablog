import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetD1ForOnboarding } from '@/db/onboarding'
import { GET as getPublic } from '@/pages/api/oss/[...link]'
import { GET, PUT } from '@/pages/api/sync/attachments/[...path]'
import initSql from '../../migrations/0000_init.sql?raw'
import userSchemaSql from '../../migrations/0002_user.sql?raw'

vi.mock('@/lib/auth', () => ({ authInterceptor: async () => {} }))

function context(request: Request) {
  return {
    request,
    url: new URL(request.url),
    params: { path: 'test.bin', link: 'attachments_test.bin' },
    locals: { runtime: { env }, config: { oss: { readLimit: 1 } }, session: { userId: 7, role: 'member' } },
  } as any
}

describe('workerd R2 streaming routes', () => {
  beforeEach(async () => {
    await resetD1ForOnboarding(env, [initSql, userSchemaSql])
  })

  it('round-trips the request body directly through R2 and isolates Owner keys', async () => {
    const request = new Request('https://koala.test/api/sync/attachments/test.bin', {
      method: 'PUT',
      headers: { 'Origin': 'https://koala.test', 'Content-Type': 'text/plain' },
      body: 'streamed payload',
    })
    const uploaded = await PUT(context(request))
    expect(uploaded.status).toBe(201)
    expect(await uploaded.json()).toMatchObject({ size: 16 })
    const download = await GET(context(new Request(request.url)))
    expect(download.headers.get('Content-Length')).toBe('16')
    expect(download.headers.get('Cache-Control')).toBe('private, no-store')
    expect(await download.text()).toBe('streamed payload')
    const bypass = context(new Request('https://koala.test/api/oss/sync-attachments_7/test.bin'))
    bypass.params.link = 'sync-attachments_7/test.bin'
    bypass.locals.session = { userId: null, role: '' }
    expect((await getPublic(bypass)).status).toBe(404)
  })

  it('serves real R2 content headers and blocks the next request at the exact quota', async () => {
    await env.OSS.put('attachments/test.bin', 'public', { httpMetadata: { contentType: 'text/plain', cacheControl: 'public, max-age=60' } })
    const ctx = () => context(new Request('https://koala.test/api/oss/attachments_test.bin'))
    const response = await getPublic(ctx())
    expect(response.headers.get('Content-Type')).toBe('text/plain')
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=60')
    expect(response.headers.get('ETag')).toMatch(/^".+"$/)
    expect(response.headers.get('Content-Length')).toBe('6')
    expect(await response.text()).toBe('public')
    expect((await getPublic(ctx())).status).toBe(403)
  })

  it('supports empty streaming uploads', async () => {
    const response = await PUT(context(new Request('https://koala.test/api/sync/attachments/test.bin', {
      method: 'PUT',
      headers: { Origin: 'https://koala.test' },
    })))
    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({ size: 0 })
  })
})
