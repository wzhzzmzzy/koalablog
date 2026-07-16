import type {
  AbsoluteFilePath,
  AbsolutePathPrefix,
  PathError,
  PathErrorCode,
  Result,
} from './types'
import { MarkdownSource } from '@/db'

const RENDERER_EXTENSION = /\.(?:md|svelte)$/i

export function containsControlCharacter(input: string): boolean {
  for (const character of input) {
    const codePoint = character.codePointAt(0)!
    if (codePoint <= 0x1F || codePoint === 0x7F)
      return true
  }
  return false
}

function fail(input: string, code: PathErrorCode): Result<never, PathError> {
  return { ok: false, error: { code, input } }
}

function canonicalSegments(input: string): Result<string[], PathError> {
  if (!input.startsWith('/'))
    return fail(input, 'not_absolute')
  if (containsControlCharacter(input))
    return fail(input, 'control_character')

  const segments = input.split('/').filter(Boolean)
  if (segments.some(segment => segment === '.' || segment === '..'))
    return fail(input, 'invalid_segment')
  if (segments.includes('.recycleBin'))
    return fail(input, 'reserved_segment')

  return { ok: true, value: segments }
}

export function parseAbsoluteFilePath(input: string): Result<AbsoluteFilePath, PathError> {
  const parsed = canonicalSegments(input)
  if (!parsed.ok)
    return parsed
  if (parsed.value.length === 0)
    return fail(input, 'empty_file_path')
  if (input.length > 1 && input.endsWith('/'))
    return fail(input, 'trailing_slash')
  if (RENDERER_EXTENSION.test(parsed.value.at(-1)!))
    return fail(input, 'renderer_extension')

  return { ok: true, value: `/${parsed.value.join('/')}` as AbsoluteFilePath }
}

export function parseAbsolutePathPrefix(input: string): Result<AbsolutePathPrefix, PathError> {
  const parsed = canonicalSegments(input)
  if (!parsed.ok)
    return parsed
  if (parsed.value.length === 0)
    return { ok: true, value: '/' as AbsolutePathPrefix }

  return { ok: true, value: `/${parsed.value.join('/')}/` as AbsolutePathPrefix }
}

export function deriveTitle(path: AbsoluteFilePath): string {
  return path.slice(path.lastIndexOf('/') + 1)
}

export function classifySource(path: AbsoluteFilePath): MarkdownSource {
  if (path.startsWith('/post/'))
    return MarkdownSource.Post
  if (path.startsWith('/memo/'))
    return MarkdownSource.Memo
  if (path.startsWith('/wiki/'))
    return MarkdownSource.Wiki
  return MarkdownSource.Page
}

export function isDescendantOfPrefix(path: AbsoluteFilePath, prefix: AbsolutePathPrefix): boolean {
  return prefix === '/' || path.startsWith(prefix)
}
