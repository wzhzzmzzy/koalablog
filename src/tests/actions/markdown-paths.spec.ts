import { describe, expect, it, vi } from 'vitest'
import { paths } from '@/actions/db/markdown'

const mocks = vi.hoisted(() => ({ loginGuard: vi.fn(), readOwnedFilePaths: vi.fn() }))
vi.mock('@/actions/utils/auth', () => ({ loginGuard: mocks.loginGuard }))
vi.mock('@/db/markdown', () => ({ readOwnedFilePaths: mocks.readOwnedFilePaths }))

describe('explicit import path listing', () => {
  it('authenticates before reading and always uses the session Owner', async () => {
    const context = { locals: { runtime: { env: {} }, session: { userId: 7 } } } as any
    mocks.loginGuard.mockRejectedValueOnce(new Error('Unauthorized'))
    await expect(paths.orThrow.call(context)).rejects.toThrow('Unauthorized')
    expect(mocks.readOwnedFilePaths).not.toHaveBeenCalled()
    mocks.readOwnedFilePaths.mockResolvedValue(['/one'])
    expect(await paths.orThrow.call(context)).toEqual(['/one'])
    expect(mocks.readOwnedFilePaths).toHaveBeenCalledWith({}, 7)
  })
})
