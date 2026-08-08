import { describe, expect, it } from 'vitest'
import { fileReferencePeekExcerpt } from '@/components/editor/file-reference-peek'

describe('file reference Peek excerpt', () => {
  it('omits Markdown frontmatter and compacts the Source into a read-only excerpt', () => {
    expect(fileReferencePeekExcerpt('---\ntitle: Hidden\n---\n\nFirst line\nSecond line'))
      .toBe('First line Second line')
  })

  it('keeps the empty state and bounds lengthy Source', () => {
    expect(fileReferencePeekExcerpt('')).toBe('This File has no Source yet.')
    expect(fileReferencePeekExcerpt('a'.repeat(400))).toHaveLength(281)
    expect(fileReferencePeekExcerpt('a'.repeat(400))).toMatch(/…$/)
  })
})
