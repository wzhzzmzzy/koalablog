import { beforeEach, describe, expect, it, vi } from 'vitest'
import { list, migrateSchema, schemaStatus, transfer } from '@/actions/db/artifact-storage'

const mocks = vi.hoisted(() => ({
  authGuard: vi.fn(),
  loginGuard: vi.fn(),
  artifactSchemaStatus: vi.fn(),
  migrateArtifactSchema: vi.fn(),
  listArtifactStorage: vi.fn(),
  transferArtifactStorage: vi.fn(),
}))
vi.mock('@/actions/utils/auth', () => ({ authGuard: mocks.authGuard, loginGuard: mocks.loginGuard }))
vi.mock('@/db/artifact-migration', () => ({ artifactSchemaStatus: mocks.artifactSchemaStatus, migrateArtifactSchema: mocks.migrateArtifactSchema }))
vi.mock('@/db/artifact-transfer', () => ({ listArtifactStorage: mocks.listArtifactStorage, transferArtifactStorage: mocks.transferArtifactStorage }))

const context = { locals: { runtime: { env: {} }, session: { userId: 7 } } } as any
const input = { fileId: 1, artifactHash: 'a'.repeat(64), from: 'd1' as const, to: 'r2' as const }

beforeEach(() => {
  vi.resetAllMocks()
  mocks.artifactSchemaStatus.mockResolvedValue({ ready: true, snapshots: 0, snapshotBytes: 0, columns: ['private schema details'] })
  mocks.migrateArtifactSchema.mockResolvedValue({ ready: true, snapshots: 0, snapshotBytes: 0, columns: [] })
  mocks.listArtifactStorage.mockResolvedValue([])
  mocks.transferArtifactStorage.mockResolvedValue({ status: 'migrated' })
})

describe('artifact storage actions', () => {
  it('requires Admin before inspecting or changing the database schema', async () => {
    mocks.authGuard.mockRejectedValue(new Error('Unauthorized'))
    await expect(schemaStatus.orThrow.call(context)).rejects.toThrow('Unauthorized')
    await expect(migrateSchema.orThrow.call(context, { backupConfirmed: true, removeSnapshots: true })).rejects.toThrow('Unauthorized')
    expect(mocks.artifactSchemaStatus).not.toHaveBeenCalled()
    expect(mocks.migrateArtifactSchema).not.toHaveBeenCalled()
  })

  it('requires explicit backup and deletion acknowledgement and returns only status', async () => {
    for (const payload of [{}, { backupConfirmed: true }, { backupConfirmed: true, removeSnapshots: false }])
      await expect(migrateSchema.orThrow.call(context, payload as any)).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(mocks.migrateArtifactSchema).not.toHaveBeenCalled()
    expect(await migrateSchema.orThrow.call(context, { backupConfirmed: true, removeSnapshots: true })).toEqual({ ready: true, snapshots: 0, snapshotBytes: 0 })
    expect(await schemaStatus.orThrow.call(context)).not.toHaveProperty('columns')
  })

  it('requires login before listing or migrating resources', async () => {
    mocks.loginGuard.mockRejectedValue(new Error('Unauthorized'))
    await expect(list.orThrow.call(context, { afterId: 0 })).rejects.toThrow('Unauthorized')
    await expect(transfer.orThrow.call(context, input)).rejects.toThrow('Unauthorized')
    expect(mocks.listArtifactStorage).not.toHaveBeenCalled()
    expect(mocks.transferArtifactStorage).not.toHaveBeenCalled()
  })

  it('takes the Owner from the session and rejects caller-supplied Owner overrides', async () => {
    await list.orThrow.call(context, { afterId: 15 })
    expect(mocks.listArtifactStorage).toHaveBeenCalledWith({}, 7, 15)
    await transfer.orThrow.call(context, input)
    expect(mocks.transferArtifactStorage).toHaveBeenCalledWith({}, { ...input, ownerId: 7 })
    await expect(transfer.orThrow.call(context, { ...input, ownerId: 8 } as any)).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('reports schema and CAS conflicts without claiming successful migration', async () => {
    mocks.artifactSchemaStatus.mockResolvedValueOnce({ ready: false })
    await expect(transfer.orThrow.call(context, input)).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(mocks.transferArtifactStorage).not.toHaveBeenCalled()
    mocks.transferArtifactStorage.mockResolvedValueOnce({ status: 'conflict' })
    await expect(transfer.orThrow.call(context, input)).rejects.toMatchObject({ code: 'CONFLICT' })
  })
})
