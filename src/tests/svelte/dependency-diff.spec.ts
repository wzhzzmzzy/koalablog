import { DEPENDENCY_DIFF_LIMIT, dependencyDiff, sameDependencies } from '@/lib/svelte/dependency-diff'
import { describe, expect, it } from 'vitest'

function dependency(url: string, suffix: string) {
  return { url, bytes: suffix.length, sha256: suffix.repeat(64).slice(0, 64) }
}

describe('svelte dependency diff', () => {
  it('compares canonical manifests and reports deterministic added, changed, and removed URLs', () => {
    const previous = [dependency('https://example.test/z.js', 'a'), dependency('https://example.test/b.js', 'b')]
    const proposed = [dependency('https://example.test/a.js', 'c'), dependency('https://example.test/b.js', 'd')]

    expect(sameDependencies(previous, [...previous].reverse())).toBe(true)
    expect(sameDependencies(previous, proposed)).toBe(false)
    expect(dependencyDiff(previous, proposed)).toEqual({
      changes: [
        { kind: 'added', proposed: dependency('https://example.test/a.js', 'c'), url: 'https://example.test/a.js' },
        {
          kind: 'changed',
          previous: dependency('https://example.test/b.js', 'b'),
          proposed: dependency('https://example.test/b.js', 'd'),
          url: 'https://example.test/b.js',
        },
        { kind: 'removed', previous: dependency('https://example.test/z.js', 'a'), url: 'https://example.test/z.js' },
      ],
      truncated: false,
    })
  })

  it('bounds a large diff and reports truncation', () => {
    const previous = Array.from({ length: DEPENDENCY_DIFF_LIMIT + 1 }, (_, index) => dependency(`https://example.test/${index}.js`, 'a'))

    const result = dependencyDiff(previous, [])
    expect(result.changes).toHaveLength(DEPENDENCY_DIFF_LIMIT)
    expect(result.changes[0]).toMatchObject({ kind: 'removed', url: 'https://example.test/0.js' })
    expect(result.truncated).toBe(true)
  })
})
