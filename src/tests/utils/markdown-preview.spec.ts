import { getMarkdownPreviewLines, getMarkdownPreviewText } from '@/lib/utils/markdown-preview'
import { describe, expect, it } from 'vitest'

describe('getMarkdownPreviewLines', () => {
  it('returns the first three plain-text lines from markdown', () => {
    const content = `---
title: test
---

# Heading

- **Bold** item with [link](https://example.com)
> Quote with #tag
\`inline\` and [[Wiki Link]]
`

    expect(getMarkdownPreviewLines(content)).toEqual([
      'Heading',
      'Bold item with link',
      'Quote with tag',
    ])
  })

  it('skips markdown-only lines and keeps code fence content as text', () => {
    const content = `
---

\`\`\`ts
const value = 1
\`\`\`

![cover](cover.png)
Regular paragraph
`

    expect(getMarkdownPreviewLines(content)).toEqual([
      'const value = 1',
      'cover',
      'Regular paragraph',
    ])
  })

  it('joins preview lines with newlines', () => {
    const content = 'first\nsecond\nthird\nfourth'

    expect(getMarkdownPreviewText(content)).toBe('first\nsecond\nthird')
  })
})
