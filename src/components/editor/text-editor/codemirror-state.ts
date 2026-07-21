import type { EditorState, StateEffect } from '@codemirror/state'
import { createEditorStateRegistry } from './state-registry'

export interface CachedCodeMirrorState {
  state: EditorState
  scrollTo?: StateEffect<unknown>
}

const registry = createEditorStateRegistry<CachedCodeMirrorState>(entry => entry.state.doc.toString())

export function saveCodeMirrorState(fileId: number, entry: CachedCodeMirrorState) {
  registry.save(fileId, entry)
}

export function restoreCodeMirrorState(
  fileId: number,
  acceptedValue: string,
  create: (value: string) => CachedCodeMirrorState,
) {
  return registry.restore(fileId, acceptedValue, create)
}

export function discardCodeMirrorState(fileId: number) {
  registry.discard(fileId)
}
