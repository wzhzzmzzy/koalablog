import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ownerAttachmentUsage } from '@/actions/oss/owner-attachment-usage'

const mocks = vi.hoisted(() => ({
  readOwnerAttachmentUsage: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({
  authInterceptor: async (ctx: any) => {
    const role = ctx.request.headers.get('X-Test-Role') || ''
    ctx.locals.session = { userId: role ? 1 : null, role }
  },
}))

vi.mock('@/lib/oss/owner-attachment-usage', () => ({
  formatStorageSize: (bytes: number) => `${bytes} B`,
  readOwnerAttachmentUsage: mocks.readOwnerAttachmentUsage,
}))

function context(role: 'admin' | 'member') {
  return {
    request: new Request('https://koala.test/action', {
      headers: { 'X-Test-Role': role },
    }),
    locals: {
      runtime: { env: { OSS: { list: vi.fn() } } },
      session: { userId: null, role: '' },
    },
  } as any
}

beforeEach(() => vi.clearAllMocks())

describe('owner Attachment usage Action', () => {
  it('allows only Admins and returns display-ready Attachment usage', async () => {
    await expect(ownerAttachmentUsage.orThrow.call(context('member'), undefined))
      .rejects
      .toMatchObject({ code: 'UNAUTHORIZED' })

    mocks.readOwnerAttachmentUsage.mockResolvedValue({
      generatedAt: '2026-08-28T07:00:00.000Z',
      expiresAt: Date.now() + 60_000,
      users: [{ userId: 1, attachmentCount: 2, bytes: 12 }],
    })

    await expect(ownerAttachmentUsage.orThrow.call(context('admin'), undefined)).resolves.toEqual({
      generatedAt: '2026-08-28T07:00:00.000Z',
      users: [{ userId: 1, attachmentCount: 2, bytes: 12, formattedBytes: '12 B' }],
    })
  })
})
