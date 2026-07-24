import { sourceHashMaintenanceWriteGuard } from '@/actions/utils/auth'
import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  sourceHashBackfillMaintenanceActive: vi.fn(),
}))

vi.mock('@/lib/kv', () => ({
  sourceHashBackfillMaintenanceActive: mocks.sourceHashBackfillMaintenanceActive,
}))

const context = { locals: { runtime: { env: { DB: 'db' } } } } as any

describe('Source Hash maintenance write guard', () => {
  it('blocks ordinary File writes while the migration owns the write window', async () => {
    mocks.sourceHashBackfillMaintenanceActive.mockResolvedValue(true)

    await expect(sourceHashMaintenanceWriteGuard(context)).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'File writes are unavailable while Source Hash maintenance is active',
    })
  })

  it('allows writes after maintenance is complete', async () => {
    mocks.sourceHashBackfillMaintenanceActive.mockResolvedValue(false)

    await expect(sourceHashMaintenanceWriteGuard(context)).resolves.toBeUndefined()
  })
})
