import { beforeEach, describe, expect, it, vi } from 'vitest'
import { list, upload } from '@/actions/oss/operate'

const mocks = vi.hoisted(() => ({ incrementToday: vi.fn() }))
vi.mock('@/db/ossAccess', () => ({ incrementToday: mocks.incrementToday }))
vi.mock('@/lib/auth', () => ({ authInterceptor: async () => {} }))

function context(role: string) {
  return {
    locals: {
      config: { oss: { operateLimit: 100 } },
      runtime: { env: {} },
      session: { userId: role ? 7 : null, role },
      OSS: { list: vi.fn().mockResolvedValue({ objects: [] }), put: vi.fn() },
    },
  } as any
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.incrementToday.mockResolvedValue([{ operateTimes: 100 }])
})

describe('oss operation quota guards', () => {
  it('permits the last reserved slot and refuses an exhausted budget', async () => {
    const ctx = context('admin')
    await expect(list.orThrow.call(ctx, undefined)).resolves.toEqual({ objects: [] })
    mocks.incrementToday.mockResolvedValue([])
    await expect(list.orThrow.call(ctx, undefined)).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' })
    expect(ctx.locals.OSS.list).toHaveBeenCalledTimes(1)
  })

  it.each(['', 'member'])('rejects %s before consuming operation slots', async (role) => {
    const ctx = context(role)
    await expect(list.orThrow.call(ctx, undefined)).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    const form = new FormData()
    form.set('source', 'article')
    form.set('file', new File(['image'], 'image.png'))
    await expect(upload.orThrow.call(ctx, form)).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    expect(mocks.incrementToday).not.toHaveBeenCalled()
    expect(ctx.locals.OSS.put).not.toHaveBeenCalled()
  })
})
