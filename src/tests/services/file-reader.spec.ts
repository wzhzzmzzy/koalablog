import { pickDirectoryWithFilePicker, supportFSApi } from '@/lib/services/file-reader'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => vi.unstubAllGlobals())

describe('directory import capability', () => {
  it('requires the directory picker used by File import', () => {
    vi.stubGlobal('window', { showDirectoryPicker: () => undefined })
    expect(supportFSApi()).toBe(true)

    vi.stubGlobal('window', { showOpenFilePicker: () => undefined })
    expect(supportFSApi()).toBe(false)
  })
})

function fileHandle(content: string) {
  return {
    kind: 'file',
    getFile: async () => ({ text: async () => content }),
  }
}

function directoryHandle(entries: Array<[string, unknown]>) {
  return {
    kind: 'directory',
    async *entries() {
      yield * entries
    },
  }
}

describe('directory File import', () => {
  it('preserves nested directory structure, Renderer, and Source bytes', async () => {
    const markdownSource = '---\ncustom: user-owned\n---\n\nBody'
    const svelteSource = '<script>const title = "你好"</script>\r\n<h1>{title}</h1>'
    const root = directoryHandle([
      ['memo', directoryHandle([
        ['project', directoryHandle([
          ['note.md', fileHandle(markdownSource)],
          ['widget.svelte', fileHandle(svelteSource)],
        ])],
      ])],
    ])
    vi.stubGlobal('window', { showDirectoryPicker: async () => root })

    await expect(pickDirectoryWithFilePicker()).resolves.toEqual([
      { path: '/memo/project/note', renderer: 'markdown', content: markdownSource },
      { path: '/memo/project/widget', renderer: 'svelte', content: svelteSource },
    ])
  })

  it('rejects the whole selection when any disk File is neither .md nor .svelte', async () => {
    const root = directoryHandle([
      ['memo', directoryHandle([
        ['note.md', fileHandle('Markdown')],
        ['notes.txt', fileHandle('Plain text')],
      ])],
    ])
    vi.stubGlobal('window', { showDirectoryPicker: async () => root })

    await expect(pickDirectoryWithFilePicker()).rejects.toMatchObject({
      code: 'unsupported_extension',
    })
  })

  it('rejects cross-extension disk Files that map to the same extensionless File Path', async () => {
    const root = directoryHandle([
      ['wiki', directoryHandle([
        ['note.md', fileHandle('Markdown')],
        ['note.svelte', fileHandle('<h1>Svelte</h1>')],
      ])],
    ])
    vi.stubGlobal('window', { showDirectoryPicker: async () => root })

    await expect(pickDirectoryWithFilePicker()).rejects.toMatchObject({
      code: 'duplicate_disk_path',
      message: expect.stringContaining('/wiki/note'),
    })
  })
})
