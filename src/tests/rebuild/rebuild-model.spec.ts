import type { FileRecord } from '@/db/types'
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
import { MarkdownSource } from '@/db'
import { describe, expect, it } from 'vitest'

function file(overrides: Partial<FileRecord> = {}): FileRecord {
  return {
    content: '<h1>Koala</h1>',
    createdAt: new Date(),
    deletedAt: null,
    id: 1,
    incoming_links: null,
    outgoing_links: null,
    path: '/page/koala',
    private: false,
    remoteTruth: false,
    renderer: 'svelte',
    revision: 1,
    source: MarkdownSource.Page,
    sourceHash: 'a'.repeat(64),
    tags: null,
    title: 'koala',
    updatedAt: new Date(),
    ...overrides,
  }
}

describe('browser batch rebuild model', () => {
  it('collects only active Svelte Files in deterministic Path order', () => {
    const candidates = rebuildCandidates({
      pages: [file({ id: 2, path: '/page/zebra' }), file({ id: 1, path: '/page/ant' })],
      posts: [file({ id: 3, path: '/post/markdown', renderer: 'markdown' })],
      memos: [file({ id: 4, path: '/memo/trashed', deletedAt: new Date() })],
    })

    expect(candidates).toEqual([
      { id: 1, path: '/page/ant', content: '<h1>Koala</h1>', sourceHash: 'a'.repeat(64) },
      { id: 2, path: '/page/zebra', content: '<h1>Koala</h1>', sourceHash: 'a'.repeat(64) },
    ])
  })

  it('keeps completed and dependency-drift Paths visible while sequential work is resumed', () => {
    let state = createRebuildState([
      { id: 1, path: '/page/one', content: 'one', sourceHash: 'a'.repeat(64) },
      { id: 2, path: '/page/two', content: 'two', sourceHash: 'b'.repeat(64) },
      { id: 3, path: '/page/three', content: 'three', sourceHash: 'c'.repeat(64) },
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
      { id: 1, path: '/page/failure', content: 'failure', sourceHash: 'a'.repeat(64) },
      { id: 2, path: '/page/drift', content: 'drift', sourceHash: 'b'.repeat(64) },
    ])
    state = completeRebuild(startRebuild(state, 1), 1, 'failure', 'Build failed')
    state = completeRebuild(startRebuild(state, 2), 2, 'dependency_changed')

    state = retryFailedRebuild(state, 1)
    state = retryFailedRebuild(state, 2)

    expect(state.entries.map(entry => entry.status)).toEqual(['queued', 'dependency_changed'])
  })
})
