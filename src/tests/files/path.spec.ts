import { MarkdownSource } from '@/db'
import {
  classifySource,
  deriveTitle,
  isDescendantOfPrefix,
  parseAbsoluteFilePath,
  parseAbsolutePathPrefix,
} from '@/lib/files/path'
import { describe, expect, it } from 'vitest'

describe('file path', () => {
  it('normalizes an absolute File Path without inventing a leading slash', () => {
    expect(parseAbsoluteFilePath('/memo//项目/记录')).toEqual({
      ok: true,
      value: '/memo/项目/记录',
    })
    expect(parseAbsoluteFilePath('memo/项目/记录')).toEqual({
      ok: false,
      error: { code: 'not_absolute', input: 'memo/项目/记录' },
    })
  })

  it.each([
    '/',
    '/memo/note/',
    '/memo/../note',
    '/memo/./note',
    '/memo/.recycleBin/note',
    '/memo/note.md',
    '/memo/app.svelte',
    '/memo/archive.txt',
    '/memo/line\nfeed',
  ])('rejects invalid File Path %s', (input) => {
    expect(parseAbsoluteFilePath(input).ok).toBe(false)
  })

  it('normalizes Prefixes and keeps root as the catch-all', () => {
    expect(parseAbsolutePathPrefix('/')).toEqual({ ok: true, value: '/' })
    expect(parseAbsolutePathPrefix('/memo//project')).toEqual({
      ok: true,
      value: '/memo/project/',
    })
    expect(parseAbsolutePathPrefix('memo/')).toEqual({
      ok: false,
      error: { code: 'not_absolute', input: 'memo/' },
    })
  })

  it('derives Title and Source classification from the canonical Path', () => {
    const path = parseAbsoluteFilePath('/memo/project/记录')
    expect(path.ok).toBe(true)
    if (!path.ok)
      return

    expect(deriveTitle(path.value)).toBe('记录')
    expect(classifySource(path.value)).toBe(MarkdownSource.Memo)

    const page = parseAbsoluteFilePath('/about')
    expect(page.ok && classifySource(page.value)).toBe(MarkdownSource.Page)
  })

  it('matches descendants on path-segment boundaries', () => {
    const memo = parseAbsolutePathPrefix('/memo/')
    const root = parseAbsolutePathPrefix('/')
    const nested = parseAbsoluteFilePath('/memo/project/note')
    const lookalike = parseAbsoluteFilePath('/memoir/note')
    expect(memo.ok && root.ok && nested.ok && lookalike.ok).toBe(true)
    if (!memo.ok || !root.ok || !nested.ok || !lookalike.ok)
      return

    expect(isDescendantOfPrefix(nested.value, memo.value)).toBe(true)
    expect(isDescendantOfPrefix(lookalike.value, memo.value)).toBe(false)
    expect(isDescendantOfPrefix(lookalike.value, root.value)).toBe(true)
  })
})
