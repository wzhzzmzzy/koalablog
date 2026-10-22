import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET, HEAD } from '@/pages/api/oss/[...link]'
import { GET as getAttachment, PUT } from '@/pages/api/sync/attachments/[...path]'

const mocks = vi.hoisted(() => ({ incrementToday: vi.fn(), authInterceptor: vi.fn() }))
vi.mock('@/db/ossAccess', () => ({ incrementToday: mocks.incrementToday }))
vi.mock('@/lib/auth', () => ({ authInterceptor: mocks.authInterceptor }))

function context(link: string, oss: object, headers: HeadersInit = {}, role = '') {
  const request = new Request(`https://koala.test/api/oss/${link}`, { headers })
  return {
    request,
    url: new URL(request.url),
    params: { link, path: 'file.bin' },
    locals: { OSS: oss, runtime: { env: {} }, config: { oss: { readLimit: 100 } }, session: { role, userId: role ? 7 : null } },
  } as any
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.incrementToday.mockResolvedValue([{ readTimes: 1 }])
})

describe('legacy public OSS boundary', () => {
  it.each([
    'sync-attachments_7/private.bin',
    'sync-attachments/7_private.bin',
    'render-artifacts_secret',
    'unknown_file',
    'attachments_../sync-attachments/7/private.bin',
    'oss_/private',
    'article_a/../private',
    'oss_a\\private',
    'oss_',
    '',
  ])('conceals non-public keys before storage or accounting: %s', async (link) => {
    const oss = { get: vi.fn(), head: vi.fn() }
    for (const role of ['', 'member', 'admin']) {
      const response = await GET(context(link, oss, {}, role))
      expect(response.status).toBe(404)
      expect(response.headers.get('Cache-Control')).toBe('no-store')
    }
    expect((await HEAD(context(link, oss, {}, 'admin'))).status).toBe(404)
    expect(oss.get).not.toHaveBeenCalled()
    expect(oss.head).not.toHaveBeenCalled()
    expect(mocks.incrementToday).not.toHaveBeenCalled()
  })

  it.each(['article', 'post', 'page', 'oss', 'attachments'])('preserves public %s URLs, nested paths and underscores', async (source) => {
    const oss = { get: vi.fn().mockResolvedValue({ body: 'bytes', size: 5 }) }
    const response = await GET(context(`${source}_2026/a_b.bin`, oss))
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('bytes')
    expect(oss.get).toHaveBeenCalledWith(`${source}/2026/a_b.bin`)
    expect(mocks.incrementToday).toHaveBeenCalledWith({}, 100, 'read')
    expect(response.headers.get('ETag')).toBeNull()
  })

  it('keeps HEAD admin-only and applies the public namespace boundary', async () => {
    const oss = { head: vi.fn().mockResolvedValue({ size: 5 }) }
    expect((await HEAD(context('attachments_image.png', oss))).status).toBe(401)
    expect((await HEAD(context('attachments_image.png', oss, {}, 'admin'))).status).toBe(200)
    expect(oss.head).toHaveBeenCalledTimes(1)
  })

  it('blocks exhausted or zero quotas before touching OSS', async () => {
    mocks.incrementToday.mockResolvedValue([])
    const oss = { get: vi.fn() }
    const ctx = context('oss_file', oss)
    ctx.locals.config.oss.readLimit = 0
    const response = await GET(ctx)
    expect(response.status).toBe(403)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(mocks.incrementToday).toHaveBeenCalledWith({}, 0, 'read')
    expect(oss.get).not.toHaveBeenCalled()
  })

  it('maps R2 metadata to HTTP headers without buffering the download', async () => {
    let controller: ReadableStreamDefaultController<Uint8Array>
    const body = new ReadableStream<Uint8Array>({
      start(value) {
        controller = value
      },
    })
    const arrayBuffer = vi.fn(() => {
      throw new Error('must not buffer')
    })
    const oss = { get: vi.fn().mockResolvedValue({
      body,
      arrayBuffer,
      size: 5,
      httpEtag: '"content-hash"',
      httpMetadata: { contentType: 'audio/mpeg', contentLanguage: 'en', contentDisposition: 'inline', contentEncoding: 'identity', cacheControl: 'public, max-age=60', cacheExpiry: new Date('2026-01-01') },
    }) }
    const response = await GET(context('attachments_audio.mp3', oss))
    expect(Object.fromEntries(response.headers)).toMatchObject({
      'content-type': 'audio/mpeg',
      'content-length': '5',
      'content-language': 'en',
      'content-disposition': 'inline',
      'content-encoding': 'identity',
      'cache-control': 'public, max-age=60',
      'etag': '"content-hash"',
      'expires': 'Thu, 01 Jan 2026 00:00:00 GMT',
    })
    expect(response.headers.has('contentType')).toBe(false)
    expect(arrayBuffer).not.toHaveBeenCalled()
    controller!.enqueue(new TextEncoder().encode('audio'))
    controller!.close()
    expect(await response.text()).toBe('audio')
  })

  it('prevents Workers from recompressing stored encoded bytes', async () => {
    const constructor = vi.fn()
    const NativeResponse = Response
    vi.stubGlobal('Response', new Proxy(NativeResponse, {
      construct(target, args) {
        constructor(...args)
        return Reflect.construct(target, args)
      },
    }))
    try {
      const bytes = new Uint8Array([31, 139]).buffer
      const response = await GET(context('oss_encoded', {
        get: async () => ({ body: bytes, size: 2, httpMetadata: { contentEncoding: 'gzip' } }),
      }))
      expect(constructor).toHaveBeenCalledWith(bytes, expect.objectContaining({ encodeBody: 'manual' }))
      expect(response.headers.get('Content-Encoding')).toBe('gzip')
      expect(await response.arrayBuffer()).toEqual(bytes)
    }
    finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('owner Attachment streaming', () => {
  it('overrides public metadata on private downloads and never calls arrayBuffer', async () => {
    const object = {
      body: new Response('private').body!,
      size: 7,
      httpEtag: '"secret"',
      httpMetadata: { cacheControl: 'public, max-age=3600', cacheExpiry: new Date(), contentType: 'text/plain' },
      arrayBuffer: vi.fn(() => { throw new Error('must not buffer') }),
    }
    const response = await getAttachment(context('unused', { get: async () => object }, {}, 'member'))
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(response.headers.get('Expires')).toBeNull()
    expect(response.headers.get('ETag')).toBeNull()
    expect(await response.text()).toBe('private')
  })

  it('passes the original request stream to storage and reports storage-confirmed metadata', async () => {
    const uploaded = new Date('2026-10-22T00:00:00Z')
    const oss = { put: vi.fn().mockResolvedValue({ size: 7, uploaded, etag: 'stored' }) }
    const ctx = context('unused', oss, {}, 'member')
    ctx.request = new Request(ctx.url, { method: 'PUT', headers: { Origin: ctx.url.origin }, body: 'private' })
    vi.spyOn(ctx.request, 'arrayBuffer').mockRejectedValue(new Error('must not buffer'))
    const response = await PUT(ctx)
    expect(response.status).toBe(201)
    expect(oss.put).toHaveBeenCalledWith('sync-attachments/7/file.bin', ctx.request.body, expect.any(Object))
    expect(await response.json()).toMatchObject({ size: 7, updatedAt: uploaded.toISOString(), etag: 'stored' })
    expect(ctx.request.arrayBuffer).not.toHaveBeenCalled()
  })

  it('does not report successful upload without a storage receipt', async () => {
    const ctx = context('unused', { put: async () => null }, {}, 'member')
    ctx.request = new Request(ctx.url, { method: 'PUT', headers: { Origin: ctx.url.origin } })
    expect((await PUT(ctx)).status).toBe(502)
  })
})
