import { create } from '@/actions/db/markdown'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  authGuard: vi.fn(),
  createFile: vi.fn(),
  sourceHashMaintenanceWriteGuard: vi.fn(),
}))

vi.mock('@/actions/utils/auth', () => ({ authGuard: mocks.authGuard, sourceHashMaintenanceWriteGuard: mocks.sourceHashMaintenanceWriteGuard }))
vi.mock('@/db/file-create', () => ({ createFile: mocks.createFile }))

const context = { locals: { runtime: { env: { DB: 'db' } }, session: { role: 'admin' } } } as any

describe('server File creation action', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns the persisted File from an authenticated creation', async () => {
    const file = { id: 7, path: '/memo/example', title: 'example', revision: 1 }
    mocks.createFile.mockResolvedValue({ status: 'created', file })

    await expect(create.orThrow.call(context, { targetPrefix: '/memo/' })).resolves.toEqual(file)
    expect(mocks.authGuard).toHaveBeenCalledOnce()
    expect(mocks.createFile).toHaveBeenCalledWith({ DB: 'db' }, { targetPrefix: '/memo/' })
  })

  it('rejects an invalid Prefix before touching the database', async () => {
    await expect(create.orThrow.call(context, { targetPrefix: 'memo/' })).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(mocks.createFile).not.toHaveBeenCalled()
  })

  it('surfaces a fixed Template collision as HTTP 409 path_conflict', async () => {
    mocks.createFile.mockResolvedValue({ status: 'path_conflict', path: '/post/welcome' })

    await expect(create.orThrow.call(context, { targetPrefix: '/post/' })).rejects.toMatchObject({
      code: 'CONFLICT',
      status: 409,
      message: JSON.stringify({ code: 'path_conflict', path: '/post/welcome' }),
    })
  })

  it('does not create a File while Source Hash maintenance owns the write window', async () => {
    mocks.sourceHashMaintenanceWriteGuard.mockRejectedValueOnce(new Error('Maintenance active'))

    await expect(create.orThrow.call(context, { targetPrefix: '/memo/' })).rejects.toThrow('Maintenance active')
    expect(mocks.createFile).not.toHaveBeenCalled()
  })

  it('does not create when authentication fails', async () => {
    mocks.authGuard.mockRejectedValueOnce(new Error('Unauthorized'))

    await expect(create.orThrow.call(context, { targetPrefix: '/' })).rejects.toThrow('Unauthorized')
    expect(mocks.createFile).not.toHaveBeenCalled()
  })
})
