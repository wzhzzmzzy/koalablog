export type EditorInputAction = 'switch' | 'noop' | 'replace'

export function reconcileEditorInput(
  currentFileId: number,
  currentDocument: string,
  nextFileId: number,
  acceptedValue: string,
): EditorInputAction {
  if (currentFileId !== nextFileId)
    return 'switch'
  return currentDocument === acceptedValue ? 'noop' : 'replace'
}

interface RestoreResult<State> {
  state: State
  restored: boolean
}

export interface EditorStateRegistry<State> {
  save: (fileId: number, state: State) => void
  restore: (fileId: number, acceptedValue: string, create: (value: string) => State) => RestoreResult<State>
  discard: (fileId: number) => void
}

export function createEditorStateRegistry<State>(documentOf: (state: State) => string): EditorStateRegistry<State> {
  const states = new Map<number, State>()
  const discarded = new Set<number>()

  return {
    save(fileId, state) {
      if (!discarded.has(fileId))
        states.set(fileId, state)
    },
    restore(fileId, acceptedValue, create) {
      if (discarded.has(fileId))
        return { state: create(acceptedValue), restored: false }

      const cached = states.get(fileId)
      if (cached && documentOf(cached) === acceptedValue)
        return { state: cached, restored: true }

      states.delete(fileId)
      return { state: create(acceptedValue), restored: false }
    },
    discard(fileId) {
      states.delete(fileId)
      discarded.add(fileId)
    },
  }
}
