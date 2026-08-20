import { describe, expect, it } from 'vitest'
import { sourceReconciliationChange } from '@/components/editor/text-editor/source-reconciliation'

describe('editor Source reconciliation', () => {
  it('returns no edit for identical Source', () => {
    expect(sourceReconciliationChange('same', 'same')).toBeNull()
  })

  it('returns the smallest prefix/suffix-preserving edit', () => {
    expect(sourceReconciliationChange('body', '---\ntags: ["tag"]\n---\n\nbody')).toEqual({
      from: 0,
      to: 0,
      insert: '---\ntags: ["tag"]\n---\n\n',
    })
    expect(sourceReconciliationChange('abc OLD xyz', 'abc NEW xyz')).toEqual({ from: 4, to: 7, insert: 'NEW' })
  })
})
