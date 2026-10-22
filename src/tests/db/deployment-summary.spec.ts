import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readDeploymentSummary } from '@/db/render-artifact'

const mocks = vi.hoisted(() => ({ file: vi.fn(), artifact: vi.fn() }))
vi.mock('@/db', () => ({
  connectDB: () => ({ query: {
    markdown: { findFirst: mocks.file },
    markdownRender: { findFirst: mocks.artifact },
  } }),
}))

beforeEach(() => vi.clearAllMocks())

describe('deployment status query projections', () => {
  it('reads only lifecycle and hash fields, never Source or Artifact bodies', async () => {
    mocks.file.mockResolvedValue({ renderer: 'svelte', sourceHash: 'source', deletedAt: null, userId: 7 })
    mocks.artifact.mockResolvedValue({ sourceHash: 'source', artifactHash: 'artifact' })
    expect(await readDeploymentSummary({} as Env, 1, 7)).toEqual({
      status: 'deployed',
      deployedSourceHash: 'source',
      artifactHash: 'artifact',
    })
    expect(mocks.file.mock.calls[0][0].columns).toEqual({ renderer: true, sourceHash: true, deletedAt: true, userId: true })
    expect(mocks.artifact.mock.calls[0][0].columns).toEqual({ artifactHash: true, sourceHash: true })
  })

  it.each([
    undefined,
    { renderer: 'svelte', sourceHash: 'hash', userId: 8 },
    { renderer: 'svelte', sourceHash: 'hash', userId: 7, deletedAt: new Date() },
    { renderer: 'markdown', sourceHash: 'hash', userId: 7 },
  ])('skips Artifact reads for inaccessible or Markdown Files: %j', async (file) => {
    mocks.file.mockResolvedValue(file)
    await readDeploymentSummary({} as Env, 1, 7)
    expect(mocks.artifact).not.toHaveBeenCalled()
  })
})
