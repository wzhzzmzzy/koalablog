import type { Node, Pair, Scalar, YAMLMap } from 'yaml'
import { isMap, isScalar, isSeq, parseDocument } from 'yaml'

export type FrontmatterStatus = 'absent' | 'valid' | 'invalid' | 'ambiguous'

export interface ParsedLeadingFrontmatter {
  status: FrontmatterStatus
  body: string
  bodyStart: number
  meta?: Record<string, unknown>
  tags?: string[]
  warning?: 'invalid-frontmatter' | 'ambiguous-tags' | 'unsupported-tags'
  replaceTags: (tags: readonly string[]) => string
}

interface FrontmatterRange {
  payloadStart: number
  payloadEnd: number
  bodyStart: number
  newline: '\n' | '\r\n'
}

function findLeadingFrontmatter(source: string): FrontmatterRange | undefined {
  const opening = /^---[\t ]*(\r?\n)/.exec(source)
  if (!opening)
    return undefined

  const newline = opening[1] as '\n' | '\r\n'
  const payloadStart = opening[0].length
  let lineStart = payloadStart

  while (lineStart <= source.length) {
    const lineEnd = source.indexOf('\n', lineStart)
    const contentEnd = lineEnd === -1 ? source.length : lineEnd
    const line = source.slice(lineStart, contentEnd).replace(/\r$/, '')

    if (/^---[\t ]*$/.test(line)) {
      const delimiterEnd = lineEnd === -1 ? contentEnd : lineEnd + 1
      let bodyStart = delimiterEnd
      while (source.startsWith('\r\n', bodyStart) || source.startsWith('\n', bodyStart))
        bodyStart += source.startsWith('\r\n', bodyStart) ? 2 : 1

      return { payloadStart, payloadEnd: lineStart, bodyStart, newline }
    }

    if (lineEnd === -1)
      break
    lineStart = lineEnd + 1
  }

  return undefined
}

function compatibleMetaValue(value: unknown): unknown {
  if (typeof value === 'number' || typeof value === 'bigint')
    return String(value)
  return value
}

function toCompatibleMeta(map: YAMLMap<Node, Node>): Record<string, unknown> {
  const entries: Array<[string, unknown]> = []
  for (const pair of map.items) {
    if (isScalar(pair.key) && typeof pair.key.value === 'string')
      entries.push([pair.key.value, compatibleMetaValue(pair.value?.toJSON())])
  }
  return Object.fromEntries(entries)
}

function tagPairs(map: YAMLMap<Node, Node>): Array<Pair<Node, Node>> {
  return map.items.filter((pair): pair is Pair<Node, Node> =>
    isScalar(pair.key) && pair.key.value === 'tags')
}

function readTags(pair: Pair<Node, Node>): string[] | undefined {
  const value = pair.value
  if (isScalar(value) && typeof value.value === 'string') {
    return value.value.split(',').map(tag => tag.trim()).filter(Boolean)
  }

  if (isSeq(value)) {
    if (!value.items.every(item => isScalar(item) && typeof item.value === 'string'))
      return undefined
    return value.items.map(item => (item as Scalar<string>).value)
  }

  return undefined
}

function canonicalTags(tags: readonly string[]): string {
  return `[${tags.map(tag => JSON.stringify(tag)).join(', ')}]`
}

function sameTags(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((tag, index) => tag === right[index])
}

function tokenStart(token: unknown): number | undefined {
  if (!token || typeof token !== 'object')
    return undefined
  const candidate = token as { offset?: unknown }
  return typeof candidate.offset === 'number' ? candidate.offset : undefined
}

function replacementEnd(nextPair: Pair<Node, Node> | undefined, payload: string): number {
  const nextStartTokens = (nextPair?.srcToken as { start?: unknown[] } | undefined)?.start ?? []
  const nextAttachedStart = nextStartTokens.map(tokenStart).find(offset => offset !== undefined)
  if (nextAttachedStart !== undefined)
    return nextAttachedStart

  const nextKeyStart = nextPair?.key?.range?.[0]
  if (nextKeyStart !== undefined)
    return nextKeyStart

  return payload.length
}

function replaceExistingTags(
  source: string,
  range: FrontmatterRange,
  map: YAMLMap<Node, Node>,
  pair: Pair<Node, Node>,
  tags: readonly string[],
): string {
  const payload = source.slice(range.payloadStart, range.payloadEnd)
  const pairIndex = map.items.indexOf(pair)
  const start = pair.key?.range?.[0]
  if (start === undefined)
    return source

  const end = replacementEnd(map.items[pairIndex + 1], payload)
  const hadLineEnding = payload.slice(start, end).endsWith('\n')
  const replacement = `tags: ${canonicalTags(tags)}${hadLineEnding ? range.newline : ''}`
  const nextPayload = `${payload.slice(0, start)}${replacement}${payload.slice(end)}`
  return `${source.slice(0, range.payloadStart)}${nextPayload}${source.slice(range.payloadEnd)}`
}

function appendTags(source: string, range: FrontmatterRange, tags: readonly string[]): string {
  const payload = source.slice(range.payloadStart, range.payloadEnd)
  const separator = payload.length > 0 && !payload.endsWith('\n') ? range.newline : ''
  const nextPayload = `${payload}${separator}tags: ${canonicalTags(tags)}${range.newline}`
  return `${source.slice(0, range.payloadStart)}${nextPayload}${source.slice(range.payloadEnd)}`
}

function insertFrontmatter(source: string, tags: readonly string[]): string {
  return `---\ntags: ${canonicalTags(tags)}\n---\n\n${source}`
}

export function parseLeadingFrontmatter(source: string): ParsedLeadingFrontmatter {
  const range = findLeadingFrontmatter(source)
  if (!range) {
    return {
      status: 'absent',
      body: source,
      bodyStart: 0,
      replaceTags: tags => tags.length > 0 ? insertFrontmatter(source, tags) : source,
    }
  }

  const body = source.slice(range.bodyStart)
  const payload = source.slice(range.payloadStart, range.payloadEnd)
  const document = parseDocument(payload, {
    keepSourceTokens: true,
    schema: 'core',
    uniqueKeys: false,
  })

  const emptyMapping = document.contents === null && payload.trim() === ''
  if (document.errors.length > 0 || document.warnings.length > 0 || (!emptyMapping && !isMap(document.contents))) {
    return {
      status: 'invalid',
      body,
      bodyStart: range.bodyStart,
      warning: 'invalid-frontmatter',
      replaceTags: () => source,
    }
  }

  if (emptyMapping) {
    return {
      status: 'valid',
      body,
      bodyStart: range.bodyStart,
      meta: {},
      tags: [],
      replaceTags: tags => tags.length > 0 ? appendTags(source, range, tags) : source,
    }
  }

  const map = document.contents as YAMLMap<Node, Node>
  const matches = tagPairs(map)
  if (matches.length > 1) {
    return {
      status: 'ambiguous',
      body,
      bodyStart: range.bodyStart,
      meta: toCompatibleMeta(map),
      warning: 'ambiguous-tags',
      replaceTags: () => source,
    }
  }

  if (matches.length === 1) {
    const tags = readTags(matches[0])
    if (!tags) {
      return {
        status: 'ambiguous',
        body,
        bodyStart: range.bodyStart,
        meta: toCompatibleMeta(map),
        warning: 'unsupported-tags',
        replaceTags: () => source,
      }
    }

    return {
      status: 'valid',
      body,
      bodyStart: range.bodyStart,
      meta: toCompatibleMeta(map),
      tags,
      replaceTags: nextTags => sameTags(tags, nextTags)
        ? source
        : replaceExistingTags(source, range, map, matches[0], nextTags),
    }
  }

  return {
    status: 'valid',
    body,
    bodyStart: range.bodyStart,
    meta: toCompatibleMeta(map),
    tags: [],
    replaceTags: tags => tags.length > 0 ? appendTags(source, range, tags) : source,
  }
}
