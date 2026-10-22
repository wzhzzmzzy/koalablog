export type RebuildStatus = 'queued' | 'running' | 'success' | 'failure' | 'dependency_changed'

export interface RebuildCandidate {
  id: number
  path: string
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

export function rebuildCandidates(files: { fileId: number, path: string, sourceHash: string, deletedAt: Date | null }[]): RebuildCandidate[] {
  return files.filter(file => !file.deletedAt)
    .map(file => ({ id: file.fileId, path: file.path, sourceHash: file.sourceHash }))
    .sort((left, right) => left.path.localeCompare(right.path) || left.id - right.id)
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
