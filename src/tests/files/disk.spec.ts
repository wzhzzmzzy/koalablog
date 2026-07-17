import { filePathFromMarkdownDiskPath, markdownExportEntries } from '@/lib/files/disk'
import { makeFileRecord } from '@/tests/fixtures/file-record'
import { describe, expect, it } from 'vitest'

describe('markdown disk representation', () => {
  it('exports Source at the extension-bearing form of each absolute File Path', () => {
    const nested = makeFileRecord({
      id: 1,
      path: '/memo/project/note',
      title: 'note',
      content: '---\ncustom: user-owned\n---\n\nBody',
    })
    const sameTitleElsewhere = makeFileRecord({
      id: 2,
      path: '/wiki/note',
      title: 'note',
      content: 'Wiki body',
    })

    expect(markdownExportEntries([nested, sameTitleElsewhere])).toEqual({
      'memo/project/note.md': nested.content,
      'wiki/note.md': sameTitleElsewhere.content,
    })
  })

  it('imports only a final .md extension and preserves the relative directory structure', () => {
    expect(filePathFromMarkdownDiskPath('memo/project/note.md')).toBe('/memo/project/note')
    expect(() => filePathFromMarkdownDiskPath('memo/project/note.svelte')).toThrowError(expect.objectContaining({
      code: 'unsupported_extension',
    }))
    expect(() => filePathFromMarkdownDiskPath('memo/project/note.markdown')).toThrowError(expect.objectContaining({
      code: 'unsupported_extension',
    }))
    expect(() => filePathFromMarkdownDiskPath('memo/project/note.svelte.md')).toThrowError(expect.objectContaining({
      code: 'invalid_file_path',
    }))
  })
})
