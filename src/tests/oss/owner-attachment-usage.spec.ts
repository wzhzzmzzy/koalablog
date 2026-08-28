import { describe, expect, it, vi } from 'vitest'
import {
  formatStorageSize,
  listOwnerAttachmentUsage,
  OwnerAttachmentUsageService,
} from '@/lib/oss/owner-attachment-usage'

describe('owner Attachment usage', () => {
  it('aggregates owner-scoped Attachments across every storage page', async () => {
    const list = vi.fn()
      .mockResolvedValueOnce({
        objects: [
          { key: 'sync-attachments/1/a.png', size: 1200 },
          { key: 'sync-attachments/2/report.pdf', size: 2500 },
          { key: 'oss/global.png', size: 9999 },
        ],
        truncated: true,
        cursor: 'page-2',
      })
      .mockResolvedValueOnce({
        objects: [
          { key: 'sync-attachments/1/nested/b.png', size: 300 },
          { key: 'sync-attachments/not-a-user/file', size: 900 },
          { key: 'sync-attachments/3/', size: 400 },
        ],
        truncated: false,
      })

    await expect(listOwnerAttachmentUsage({ list })).resolves.toEqual([
      { userId: 1, attachmentCount: 2, bytes: 1500 },
      { userId: 2, attachmentCount: 1, bytes: 2500 },
    ])
    expect(list).toHaveBeenNthCalledWith(1, { prefix: 'sync-attachments/', cursor: undefined })
    expect(list).toHaveBeenNthCalledWith(2, { prefix: 'sync-attachments/', cursor: 'page-2' })
  })

  it('formats byte totals for compact dashboard display', () => {
    expect(formatStorageSize(0)).toBe('0 B')
    expect(formatStorageSize(999)).toBe('999 B')
    expect(formatStorageSize(1500)).toBe('1.5 KB')
    expect(formatStorageSize(2_500_000)).toBe('2.5 MB')
  })

  it('ignores non-canonical Owner IDs', async () => {
    const usage = await listOwnerAttachmentUsage({
      list: vi.fn().mockResolvedValue({
        objects: [
          { key: 'sync-attachments/01/a.png', size: 1 },
          { key: 'sync-attachments/+1/b.png', size: 1 },
          { key: 'sync-attachments/1e0/c.png', size: 1 },
          { key: 'sync-attachments/1/valid.png', size: 2 },
        ],
        truncated: false,
      }),
    })

    expect(usage).toEqual([{ userId: 1, attachmentCount: 1, bytes: 2 }])
  })

  it('rejects a pagination cursor cycle', async () => {
    const list = vi.fn()
      .mockResolvedValueOnce({ objects: [], truncated: true, cursor: 'A' })
      .mockResolvedValueOnce({ objects: [], truncated: true, cursor: 'B' })
      .mockResolvedValueOnce({ objects: [], truncated: true, cursor: 'A' })
      .mockResolvedValueOnce({ objects: [], truncated: false })

    await expect(listOwnerAttachmentUsage({ list }))
      .rejects
      .toThrow('invalid pagination cursor')
  })

  it('reuses a fresh in-memory snapshot instead of rescanning storage', async () => {
    const list = vi.fn().mockResolvedValue({
      objects: [{ key: 'sync-attachments/1/a.png', size: 4 }],
      truncated: false,
    })
    const service = new OwnerAttachmentUsageService(300_000)

    const first = await service.read({} as Env, { list }, 1000)
    const second = await service.read({} as Env, { list }, 2000)

    expect(second).toEqual(first)
    expect(list).toHaveBeenCalledTimes(1)
  })

  it('shares a fresh snapshot through Cloudflare KV', async () => {
    const values = new Map<string, string>()
    const kv = {
      get: vi.fn(async (key: string) => values.get(key) ?? null),
      put: vi.fn(async (key: string, value: string) => {
        values.set(key, value)
      }),
    }
    const list = vi.fn().mockResolvedValue({
      objects: [{ key: 'sync-attachments/2/a.png', size: 8 }],
      truncated: false,
    })
    const env = { CF_PAGES: 1, KOALA: kv } as unknown as Env

    await new OwnerAttachmentUsageService(300_000).read(env, { list }, 1000)
    const fromKv = await new OwnerAttachmentUsageService(300_000).read(env, { list }, 2000)

    expect(fromKv.users).toEqual([{ userId: 2, attachmentCount: 1, bytes: 8 }])
    expect(list).toHaveBeenCalledTimes(1)
    expect(kv.put).toHaveBeenCalledOnce()
  })
})
