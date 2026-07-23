import { fileExportEntries, fileFromDiskPath } from '@/lib/files/disk'
import { makeFileRecord } from '@/tests/fixtures/file-record'
import { describe, expect, it } from 'vitest'

describe('file disk representation', () => {
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
      renderer: 'svelte',
      content: 'Wiki body',
    })

    expect(fileExportEntries([nested, sameTitleElsewhere])).toEqual({
      'memo/project/note.md': nested.content,
      'wiki/note.svelte': sameTitleElsewhere.content,
    })
  })

  it('imports only final .md or .svelte extensions and derives Renderer without changing the File Path', () => {
    expect(fileFromDiskPath('memo/project/note.md')).toEqual({
      path: '/memo/project/note',
      renderer: 'markdown',
    })
    expect(fileFromDiskPath('wiki/project/note.svelte')).toEqual({
      path: '/wiki/project/note',
      renderer: 'svelte',
    })
    expect(() => fileFromDiskPath('memo/project/note.markdown')).toThrowError(expect.objectContaining({
      code: 'unsupported_extension',
    }))
    expect(() => fileFromDiskPath('memo/project/note.svelte.md')).toThrowError(expect.objectContaining({
      code: 'invalid_file_path',
    }))
  })
})
