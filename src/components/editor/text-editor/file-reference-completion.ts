import type { EditorState, Extension } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import { acceptCompletion, autocompletion, type Completion, type CompletionContext, type CompletionResult, type CompletionSource } from '@codemirror/autocomplete'
import { syntaxTree } from '@codemirror/language'
import { Prec } from '@codemirror/state'
import { keymap } from '@codemirror/view'

/**
 * A lightweight File Reference completion candidate. Derived from File
 * records so this module never imports the editor store.
 */
export interface FileReferenceCandidate {
  id: number
  path: string
  title: string
  updatedAt: Date
}

/** Minimal record shape accepted when deriving candidates. */
export interface FileReferenceRecord {
  id: number
  path: string
  title: string
  updatedAt: Date
  deletedAt?: Date | null
}

export interface FileReferenceTrigger {
  /** Offset of the query start (right after `[[`), relative to the line start. */
  from: number
  query: string
}

/**
 * Recognizes an open `[[query` trigger in the line text before the cursor.
 * Returns null for escaped `\[[` input and for references already closed
 * with `]]` before the cursor. Code contexts are rejected separately by the
 * completion source through the syntax tree.
 */
export function parseFileReferenceTrigger(lineBeforeCursor: string): FileReferenceTrigger | null {
  const marker = lineBeforeCursor.lastIndexOf('[[')
  if (marker < 0)
    return null
  if (marker > 0 && lineBeforeCursor[marker - 1] === '\\')
    return null
  const query = lineBeforeCursor.slice(marker + 2)
  if (query.includes(']'))
    return null
  return { from: marker + 2, query }
}

export function toFileReferenceCandidates(records: readonly FileReferenceRecord[]): FileReferenceCandidate[] {
  const result: FileReferenceCandidate[] = []
  for (const record of records) {
    if (record.deletedAt)
      continue
    result.push({
      id: record.id,
      path: record.path,
      title: record.title,
      updatedAt: record.updatedAt,
    })
  }
  return result
}

const RANK = {
  titleExact: 0,
  titlePrefix: 1,
  pathSegmentPrefix: 2,
  pathContains: 3,
  fuzzy: 4,
  noMatch: 5,
} as const

function isSubsequence(query: string, target: string): boolean {
  if (query.length === 0)
    return false
  let index = 0
  for (const char of target) {
    if (char === query[index]) {
      index += 1
      if (index === query.length)
        return true
    }
  }
  return false
}

function rankCandidate(candidate: FileReferenceCandidate, query: string, titleQuery: string): number {
  const title = candidate.title.toLowerCase()
  if (title === titleQuery)
    return RANK.titleExact
  if (title.startsWith(titleQuery))
    return RANK.titlePrefix
  const path = candidate.path.toLowerCase()
  const segments = path.split('/').filter(Boolean)
  if (segments.some(segment => segment.startsWith(query)))
    return RANK.pathSegmentPrefix
  if (path.includes(query))
    return RANK.pathContains
  if (isSubsequence(titleQuery, title) || isSubsequence(query, path))
    return RANK.fuzzy
  return RANK.noMatch
}

// Ranking contract: title exact, title prefix, path-segment prefix, path
// contains, then subsequence fuzzy; ties break by recent update, then path.
export function filterFileReferenceCandidates(
  candidates: readonly FileReferenceCandidate[],
  query: string,
  excludeId?: number | null,
): FileReferenceCandidate[] {
  const normalized = query.toLowerCase()
  const titleQuery = normalized.startsWith('/') ? normalized.slice(1) : normalized
  return candidates
    .filter(candidate => candidate.id !== excludeId)
    .map(candidate => ({
      candidate,
      rank: normalized.length === 0 ? RANK.titleExact : rankCandidate(candidate, normalized, titleQuery),
    }))
    .filter(entry => entry.rank !== RANK.noMatch)
    .sort((a, b) =>
      a.rank - b.rank
      || b.candidate.updatedAt.getTime() - a.candidate.updatedAt.getTime()
      || (a.candidate.path < b.candidate.path ? -1 : a.candidate.path > b.candidate.path ? 1 : 0))
    .map(entry => entry.candidate)
}

export interface FileReferenceInsertion {
  from: number
  to: number
  insert: string
  cursor: number
}

// closeBrackets() auto-inserts a `]]` pair behind the cursor, so the
// replacement consumes an existing pair to guarantee exactly one remains.
export function planFileReferenceInsertion(doc: string, from: number, to: number, path: string): FileReferenceInsertion {
  const closing = ']]'
  const replaceTo = doc.slice(to, to + closing.length) === closing ? to + closing.length : to
  const insert = `${path}${closing}`
  return { from, to: replaceTo, insert, cursor: from + insert.length }
}

export interface FileReferenceCompletionOptions {
  candidates: readonly FileReferenceCandidate[]
  excludeId?: number | null
}

const CODE_CONTEXT_NODES = new Set(['InlineCode', 'FencedCode', 'CodeBlock'])

export const FILE_REFERENCE_COMPLETION_LIMIT = 12

// A local, inert placeholder: accepting it never inserts text, so the picker
// stays honest about an empty result without any server request.
const NO_MATCH_COMPLETION: Completion = {
  label: 'No matching Files',
  type: 'text',
  apply: () => {},
}

function isInCodeContext(state: EditorState, pos: number): boolean {
  let node: ReturnType<typeof syntaxTree>['topNode'] | null = syntaxTree(state).resolveInner(pos, -1)
  while (node) {
    if (CODE_CONTEXT_NODES.has(node.name))
      return true
    node = node.parent
  }
  return false
}

function toCompletion(candidate: FileReferenceCandidate): Completion {
  return {
    label: candidate.title,
    detail: candidate.path,
    type: 'text',
    apply: (view: EditorView, _completion: Completion, from: number, to: number) => {
      const plan = planFileReferenceInsertion(view.state.doc.toString(), from, to, candidate.path)
      view.dispatch({
        changes: { from: plan.from, to: plan.to, insert: plan.insert },
        selection: { anchor: plan.cursor },
        scrollIntoView: true,
      })
    },
  }
}

export function fileReferenceCompletionSource(options: FileReferenceCompletionOptions): CompletionSource {
  return (context: CompletionContext): CompletionResult | null => {
    if (isInCodeContext(context.state, context.pos))
      return null
    const line = context.state.doc.lineAt(context.pos)
    const trigger = parseFileReferenceTrigger(line.text.slice(0, context.pos - line.from))
    if (!trigger)
      return null
    const ranked = filterFileReferenceCandidates(options.candidates, trigger.query, options.excludeId)
    return {
      from: line.from + trigger.from,
      to: context.pos,
      options: ranked.length === 0
        ? [NO_MATCH_COMPLETION]
        : ranked.slice(0, FILE_REFERENCE_COMPLETION_LIMIT).map(toCompletion),
      filter: false,
    }
  }
}

// Tab needs Prec.high to accept a completion before indentWithTab runs.
export function fileReferenceCompletion(options: FileReferenceCompletionOptions): Extension {
  return [
    autocompletion({ override: [fileReferenceCompletionSource(options)] }),
    Prec.high(keymap.of([{ key: 'Tab', run: acceptCompletion }])),
  ]
}
