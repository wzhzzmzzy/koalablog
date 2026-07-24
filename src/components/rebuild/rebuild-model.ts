import type { AllCollection } from '@/actions/db/markdown'
import type { FileRecord } from '@/db/types'

export type RebuildStatus = 'queued' | 'running' | 'success' | 'failure' | 'dependency_changed'

export interface RebuildCandidate {
  id: number
  path: string
  content: string
  sourceHash: string
}

export interface RebuildEntry extends RebuildCandidate {
  status: RebuildStatus
  message?: string
}

export interface RebuildState {
  entries: RebuildEntry[]
}

export interface RebuildProgress {
  total: number
  queued: number
  running: number
  success: number
  failure: number
  dependencyChanged: number
}

const collectionKeys = ['posts', 'pages', 'memos', 'wikis'] as const

function isActiveSvelteFile(file: FileRecord) {
  return file.renderer === 'svelte' && !file.deletedAt
}

/**
 * Normalizes the one browser-visible batch input. The server action remains a
 * normal authenticated file listing; no rebuild work is queued on the server.
 */
export function rebuildCandidates(collection: AllCollection): RebuildCandidate[] {
  const seen = new Set<number>()
  const candidates: RebuildCandidate[] = []

  for (const key of collectionKeys) {
    for (const file of collection[key] ?? []) {
      if (!isActiveSvelteFile(file) || seen.has(file.id))
        continue
      seen.add(file.id)
      candidates.push({
        id: file.id,
        path: file.path,
        content: file.content,
        sourceHash: file.sourceHash,
      })
    }
  }

  return candidates.sort((left, right) => left.path.localeCompare(right.path) || left.id - right.id)
}

export function createRebuildState(candidates: RebuildCandidate[]): RebuildState {
  return {
    entries: candidates.map(candidate => ({ ...candidate, status: 'queued' })),
  }
}

export function nextRebuildCandidate(state: RebuildState): RebuildEntry | undefined {
  return state.entries.find(entry => entry.status === 'queued')
}

export function startRebuild(state: RebuildState, fileId: number): RebuildState {
  return updateEntry(state, fileId, entry => entry.status === 'queued'
    ? { ...entry, status: 'running', message: undefined }
    : entry)
}

export function completeRebuild(
  state: RebuildState,
  fileId: number,
  status: Extract<RebuildStatus, 'success' | 'failure' | 'dependency_changed'>,
  message?: string,
): RebuildState {
  return updateEntry(state, fileId, entry => entry.status === 'running'
    ? { ...entry, status, ...(message ? { message } : {}) }
    : entry)
}

/** Stop means return the in-flight browser item to the resumable queue. */
export function pauseRebuild(state: RebuildState): RebuildState {
  return {
    entries: state.entries.map(entry => entry.status === 'running'
      ? { ...entry, status: 'queued', message: undefined }
      : entry),
  }
}

/** A retry only retries a build failure. Dependency drift needs per-File review. */
export function retryFailedRebuild(state: RebuildState, fileId: number): RebuildState {
  return updateEntry(state, fileId, entry => entry.status === 'failure'
    ? { ...entry, status: 'queued', message: undefined }
    : entry)
}

export function rebuildProgress(state: RebuildState): RebuildProgress {
  return state.entries.reduce<RebuildProgress>((progress, entry) => {
    if (entry.status === 'dependency_changed')
      progress.dependencyChanged += 1
    else
      progress[entry.status] += 1
    return progress
  }, { total: state.entries.length, queued: 0, running: 0, success: 0, failure: 0, dependencyChanged: 0 })
}

function updateEntry(state: RebuildState, fileId: number, update: (entry: RebuildEntry) => RebuildEntry): RebuildState {
  return {
    entries: state.entries.map(entry => entry.id === fileId ? update(entry) : entry),
  }
}
