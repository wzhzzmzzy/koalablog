import type { Completion, CompletionContext, CompletionResult, CompletionSource } from '@codemirror/autocomplete'
import type { EditorState } from '@codemirror/state'
import { syntaxTree } from '@codemirror/language'
import { parseLeadingFrontmatter } from '@/lib/markdown/frontmatter'

export interface TagCompletionCandidate {
  tag: string
  fileCount: number
  updatedAt: Date
}

export interface TagCompletionRecord {
  tags: readonly string[]
  updatedAt: Date
  deletedAt?: Date | null
}

export interface TagCompletionTrigger {
  from: number
  query: string
}

const EXCLUDED_CONTEXT_NODES = new Set([
  'InlineCode',
  'FencedCode',
  'CodeBlock',
  'Link',
  'Image',
  'URL',
  'Autolink',
])

function isExcludedContext(state: EditorState, pos: number): boolean {
  let node: ReturnType<typeof syntaxTree>['topNode'] | null = syntaxTree(state).resolveInner(pos, -1)
  while (node) {
    if (EXCLUDED_CONTEXT_NODES.has(node.name) || node.name.includes('Link'))
      return true
    node = node.parent
  }
  return false
}

export function parseTagCompletionTrigger(lineBeforeCursor: string): TagCompletionTrigger | null {
  const marker = lineBeforeCursor.lastIndexOf('#')
  if (marker < 0)
    return null
  if (marker > 0 && lineBeforeCursor[marker - 1] === '\\')
    return null
  if (marker > 0 && /[a-z0-9]/i.test(lineBeforeCursor[marker - 1]))
    return null

  const query = lineBeforeCursor.slice(marker + 1)
  if (/\s|#/.test(query))
    return null
  return { from: marker + 1, query }
}

export function toTagCompletionCandidates(records: readonly TagCompletionRecord[]): TagCompletionCandidate[] {
  const aggregated = new Map<string, TagCompletionCandidate>()
  for (const record of records) {
    if (record.deletedAt)
      continue
    for (const tag of new Set(record.tags)) {
      if (/\s|#/.test(tag))
        continue
      const existing = aggregated.get(tag)
      if (existing) {
        existing.fileCount += 1
        if (record.updatedAt > existing.updatedAt)
          existing.updatedAt = record.updatedAt
      }
      else {
        aggregated.set(tag, { tag, fileCount: 1, updatedAt: record.updatedAt })
      }
    }
  }
  return [...aggregated.values()]
}

export function filterTagCompletionCandidates(
  candidates: readonly TagCompletionCandidate[],
  query: string,
): TagCompletionCandidate[] {
  const normalized = query.toLowerCase()
  return candidates
    .map(candidate => ({
      candidate,
      rank: normalized.length === 0
        ? 0
        : candidate.tag.toLowerCase().startsWith(normalized)
          ? 0
          : candidate.tag.toLowerCase().includes(normalized) ? 1 : 2,
    }))
    .filter(entry => entry.rank < 2)
    .sort((left, right) =>
      left.rank - right.rank
      || right.candidate.fileCount - left.candidate.fileCount
      || right.candidate.updatedAt.getTime() - left.candidate.updatedAt.getTime()
      || left.candidate.tag.localeCompare(right.candidate.tag))
    .map(entry => entry.candidate)
}

function tagCompletion(candidate: TagCompletionCandidate): Completion {
  return {
    label: candidate.tag,
    detail: `${candidate.fileCount} ${candidate.fileCount === 1 ? 'File' : 'Files'}`,
    type: 'text',
  }
}

export const TAG_COMPLETION_LIMIT = 12

export function tagCompletionSource(candidates: readonly TagCompletionCandidate[]): CompletionSource {
  return (context: CompletionContext): CompletionResult | null => {
    if (context.pos < parseLeadingFrontmatter(context.state.doc.toString()).bodyStart)
      return null
    if (isExcludedContext(context.state, context.pos))
      return null

    const line = context.state.doc.lineAt(context.pos)
    const trigger = parseTagCompletionTrigger(line.text.slice(0, context.pos - line.from))
    if (!trigger)
      return null
    const ranked = filterTagCompletionCandidates(candidates, trigger.query)
    if (ranked.length === 0)
      return null
    return {
      from: line.from + trigger.from,
      to: context.pos,
      options: ranked.slice(0, TAG_COMPLETION_LIMIT).map(tagCompletion),
      filter: false,
    }
  }
}
