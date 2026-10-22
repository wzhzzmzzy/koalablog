import { afterEach, describe, expect, it, vi } from 'vitest'
import { readOwnedFilePaths } from '@/db/markdown'

const mocks = vi.hoisted(() => ({ loadAnalysis: vi.fn() }))
vi.mock('@/lib/files/analysis', async (importOriginal) => {
  mocks.loadAnalysis()
  return importOriginal()
})

afterEach(() => vi.unstubAllEnvs())

describe('read-only Markdown module loading', () => {
  it('does not initialize the Markdown analyzer and selects only active Owner paths', async () => {
    vi.stubEnv('DATA_SOURCE', 'd1')
    const raw = vi.fn().mockResolvedValue([['/one']])
    const bind = vi.fn((..._values: unknown[]) => ({ raw }))
    const prepare = vi.fn((_query: string) => ({ bind }))
    expect(await readOwnedFilePaths({ DB: { prepare } } as unknown as Env, 7)).toEqual(['/one'])
    expect(mocks.loadAnalysis).not.toHaveBeenCalled()
    expect(prepare.mock.calls[0][0]).toMatch(/^select "path" from "markdown" where \("markdown"\."userId" = \? and "markdown"\."deletedAt" is null\)$/)
    expect(bind).toHaveBeenCalledWith(7)
  })
})
