import { sourceHashMaintenanceWriteGuard } from '@/actions/utils/auth'
import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  globalConfig: vi.fn(),
  sourceHashBackfillMaintenance: vi.fn(),
}))

vi.mock('@/lib/kv', () => ({
  globalConfig: mocks.globalConfig,
  sourceHashBackfillMaintenance: mocks.sourceHashBackfillMaintenance,
}))

const context = { locals: { runtime: { env: { DB: 'db' } } } } as any

describe('Source Hash maintenance write guard', () => {
  it('blocks ordinary File writes while the migration owns the write window', async () => {
    mocks.globalConfig.mockResolvedValue({})
    mocks.sourceHashBackfillMaintenance.mockReturnValue({ active: true })

    await expect(sourceHashMaintenanceWriteGuard(context)).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'File writes are unavailable while Source Hash maintenance is active',
    })
  })

  it('allows writes after maintenance is complete', async () => {
    mocks.globalConfig.mockResolvedValue({})
    mocks.sourceHashBackfillMaintenance.mockReturnValue({ active: false })

    await expect(sourceHashMaintenanceWriteGuard(context)).resolves.toBeUndefined()
  })
})
