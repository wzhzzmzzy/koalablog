import { describe, expect, it } from 'vitest'
import {
  completeRebuild,
  createRebuildState,
  nextRebuildCandidate,
  pauseRebuild,
  rebuildCandidates,
  rebuildProgress,
  retryFailedRebuild,
  startRebuild,
} from '@/components/rebuild/rebuild-model'

function file(overrides: Record<string, unknown> = {}) {
  return {
    deletedAt: null as Date | null,
    fileId: 1,
    path: '/page/koala',
    sourceHash: 'a'.repeat(64),
    ...overrides,
  }
}

describe('browser batch rebuild model', () => {
  it('collects only active Svelte Files in deterministic Path order', () => {
    const candidates = rebuildCandidates([
      file({ fileId: 2, path: '/page/zebra' }),
      file({ fileId: 1, path: '/page/ant' }),
      file({ fileId: 4, path: '/memo/trashed', deletedAt: new Date() }),
    ])

    expect(candidates).toEqual([
      { id: 1, path: '/page/ant', sourceHash: 'a'.repeat(64) },
      { id: 2, path: '/page/zebra', sourceHash: 'a'.repeat(64) },
    ])
  })

  it('keeps completed and dependency-drift Paths visible while sequential work is resumed', () => {
    let state = createRebuildState([
      { id: 1, path: '/page/one', sourceHash: 'a'.repeat(64) },
      { id: 2, path: '/page/two', sourceHash: 'b'.repeat(64) },
      { id: 3, path: '/page/three', sourceHash: 'c'.repeat(64) },
    ])

    state = startRebuild(state, 1)
    state = completeRebuild(state, 1, 'success')
    state = startRebuild(state, 2)
    state = completeRebuild(state, 2, 'dependency_changed', 'Dependencies changed; review this File in the editor.')
    state = startRebuild(state, 3)
    state = pauseRebuild(state)

    expect(nextRebuildCandidate(state)?.path).toBe('/page/three')
    expect(state.entries.map(entry => [entry.path, entry.status])).toEqual([
      ['/page/one', 'success'],
      ['/page/two', 'dependency_changed'],
      ['/page/three', 'queued'],
    ])
    expect(rebuildProgress(state)).toEqual({ total: 3, queued: 1, running: 0, success: 1, failure: 0, dependencyChanged: 1 })
  })

  it('allows an explicit retry only for build failures, never dependency drift', () => {
    let state = createRebuildState([
      { id: 1, path: '/page/failure', sourceHash: 'a'.repeat(64) },
      { id: 2, path: '/page/drift', sourceHash: 'b'.repeat(64) },
    ])
    state = completeRebuild(startRebuild(state, 1), 1, 'failure', 'Build failed')
    state = completeRebuild(startRebuild(state, 2), 2, 'dependency_changed')

    state = retryFailedRebuild(state, 1)
    state = retryFailedRebuild(state, 2)

    expect(state.entries.map(entry => entry.status)).toEqual(['queued', 'dependency_changed'])
  })
})
