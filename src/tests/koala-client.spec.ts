import type { SyncClientError } from '../../scripts/koala/client.mjs'
import { describe, expect, it, vi } from 'vitest'
import { KoalaSyncClient } from '../../scripts/koala/client.mjs'

describe('koala sync HTTP client', () => {
  it('uses Bearer authentication for every request without putting credentials in the URL', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ files: [], attachments: [] }), { headers: { 'Content-Type': 'application/json' } }))
    const client = new KoalaSyncClient({ url: 'https://koala.example/', token: 'secret-token', fetch })

    await client.manifest()

    expect(fetch).toHaveBeenCalledWith('https://koala.example/api/sync/manifest', expect.objectContaining({
      headers: expect.any(Headers),
    }))
    const request = fetch.mock.calls[0][1]
    expect(request.headers.get('Authorization')).toBe('Bearer secret-token')
    expect(fetch.mock.calls[0][0]).not.toContain('secret-token')
  })

  it('surfaces API errors without exposing the request token', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } }))
    const client = new KoalaSyncClient({ url: 'https://koala.example', token: 'secret-token', fetch })

    await expect(client.manifest()).rejects.toEqual(expect.objectContaining<Partial<SyncClientError>>({
      name: 'SyncClientError',
      message: 'Unauthorized',
      status: 401,
    }))
  })
})
