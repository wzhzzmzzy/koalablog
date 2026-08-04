import type { FileRecord } from '@/db/types'
import { analyzeMarkdownSource } from '@/lib/files/analysis'
import { RENDERER_MODE, type RendererMode } from '@/lib/files/types'
import { stripMetaBlock } from '@/lib/services/markdown-parser'

export const INSTANT_SEARCH_RESULT_LIMIT = 100

export const SEARCH_MATCH_KIND = {
  Path: 'path',
  Tag: 'tag',
  Source: 'source',
} as const

export type SearchMatchKind = typeof SEARCH_MATCH_KIND[keyof typeof SEARCH_MATCH_KIND]

export interface InstantSearchEditBuffer {
  path: string
  renderer: RendererMode
  content: string
  dirty: boolean
}

export interface InstantSearchEditBufferLookup {
  get: (fileId: number) => InstantSearchEditBuffer | undefined
}

export interface InstantSearchResult {
  file: FileRecord
  path: string
  title: string
  dirty: boolean
  tags: string[]
  matchedTags: string[]
  matches: SearchMatchKind[]
  primaryMatch: SearchMatchKind
  sourceMatchCount: number
  sourceSnippet: string | null
}

export interface InstantSearchResponse {
  total: number
  results: InstantSearchResult[]
}

export interface SearchTextSegment {
  text: string
  matched: boolean
}

const matchPriority: Record<SearchMatchKind, number> = {
  [SEARCH_MATCH_KIND.Path]: 0,
  [SEARCH_MATCH_KIND.Tag]: 1,
  [SEARCH_MATCH_KIND.Source]: 2,
}

function normalize(value: string) {
  return value.toLowerCase()
}

function findFirst(value: string, normalizedQuery: string) {
  return normalize(value).indexOf(normalizedQuery)
}

function countMatches(value: string, normalizedQuery: string) {
  if (!normalizedQuery)
    return 0

  const normalizedValue = normalize(value)
  let count = 0
  let index = normalizedValue.indexOf(normalizedQuery)
  while (index !== -1) {
    count += 1
    index = normalizedValue.indexOf(normalizedQuery, index + normalizedQuery.length)
  }
  return count
}

function titleFromPath(path: string) {
  return path.split('/').filter(Boolean).at(-1) ?? ''
}

function storedTags(tags: FileRecord['tags']) {
  return tags?.split(',').map(tag => tag.trim()).filter(Boolean) ?? []
}

function sourceForSearch(renderer: RendererMode, content: string) {
  return renderer === RENDERER_MODE.Markdown ? stripMetaBlock(content) : content
}

function snippetFor(source: string, matchIndex: number, queryLength: number) {
  const context = 72
  const start = Math.max(0, matchIndex - context)
  const end = Math.min(source.length, matchIndex + queryLength + context)
  const prefix = start > 0 ? '…' : ''
  const suffix = end < source.length ? '…' : ''
  return `${prefix}${source.slice(start, end).replace(/\s+/g, ' ').trim()}${suffix}`
}

function effectiveValues(file: FileRecord, buffers: InstantSearchEditBufferLookup) {
  const buffer = buffers.get(file.id)
  const dirty = Boolean(buffer?.dirty)
  const path = dirty ? buffer!.path : file.path
  const renderer = dirty ? buffer!.renderer : file.renderer
  const content = dirty ? buffer!.content : file.content
  const tags = renderer === RENDERER_MODE.Markdown
    ? (dirty ? analyzeMarkdownSource(content).tags : storedTags(file.tags))
    : []

  return { path, renderer, content, tags, dirty }
}

export function searchFiles(
  files: readonly FileRecord[],
  query: string,
  buffers: InstantSearchEditBufferLookup,
  limit = INSTANT_SEARCH_RESULT_LIMIT,
): InstantSearchResponse {
  if (!query)
    return { total: 0, results: [] }

  const normalizedQuery = normalize(query)
  const matches: InstantSearchResult[] = []

  for (const file of files) {
    if (file.deletedAt)
      continue

    const effective = effectiveValues(file, buffers)
    const source = sourceForSearch(effective.renderer, effective.content)
    const pathMatch = findFirst(effective.path, normalizedQuery) !== -1
    const matchedTags = effective.tags.filter(tag => findFirst(tag, normalizedQuery) !== -1)
    const sourceMatchIndex = findFirst(source, normalizedQuery)
    const sourceMatchCount = countMatches(source, normalizedQuery)
    const kinds: SearchMatchKind[] = []
    if (pathMatch)
      kinds.push(SEARCH_MATCH_KIND.Path)
    if (matchedTags.length)
      kinds.push(SEARCH_MATCH_KIND.Tag)
    if (sourceMatchIndex !== -1)
      kinds.push(SEARCH_MATCH_KIND.Source)
    if (!kinds.length)
      continue

    matches.push({
      file,
      path: effective.path,
      title: titleFromPath(effective.path),
      dirty: effective.dirty,
      tags: effective.tags,
      matchedTags,
      matches: kinds,
      primaryMatch: kinds[0],
      sourceMatchCount,
      sourceSnippet: sourceMatchIndex === -1 ? null : snippetFor(source, sourceMatchIndex, query.length),
    })
  }

  matches.sort((left, right) => {
    const priority = matchPriority[left.primaryMatch] - matchPriority[right.primaryMatch]
    if (priority)
      return priority
    const updatedAt = right.file.updatedAt.getTime() - left.file.updatedAt.getTime()
    if (updatedAt)
      return updatedAt
    return left.path.localeCompare(right.path)
  })

  return {
    total: matches.length,
    results: matches.slice(0, limit),
  }
}

export function highlightSearchText(value: string, query: string): SearchTextSegment[] {
  if (!query)
    return [{ text: value, matched: false }]

  const normalizedValue = normalize(value)
  const normalizedQuery = normalize(query)
  const segments: SearchTextSegment[] = []
  let cursor = 0
  let matchIndex = normalizedValue.indexOf(normalizedQuery)

  while (matchIndex !== -1) {
    if (matchIndex > cursor)
      segments.push({ text: value.slice(cursor, matchIndex), matched: false })
    segments.push({ text: value.slice(matchIndex, matchIndex + query.length), matched: true })
    cursor = matchIndex + query.length
    matchIndex = normalizedValue.indexOf(normalizedQuery, cursor)
  }

  if (cursor < value.length)
    segments.push({ text: value.slice(cursor), matched: false })
  return segments.length ? segments : [{ text: value, matched: false }]
}
