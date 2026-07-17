import { pickDirectoryWithFilePicker, supportFSApi } from '@/lib/services/file-reader'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => vi.unstubAllGlobals())

describe('directory import capability', () => {
  it('requires the directory picker used by Markdown import', () => {
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

describe('directory Markdown import', () => {
  it('preserves nested directory structure and Source bytes', async () => {
    const source = '---\ncustom: user-owned\n---\n\nBody'
    const root = directoryHandle([
      ['memo', directoryHandle([
        ['project', directoryHandle([
          ['note.md', fileHandle(source)],
        ])],
      ])],
    ])
    vi.stubGlobal('window', { showDirectoryPicker: async () => root })

    await expect(pickDirectoryWithFilePicker()).resolves.toEqual([
      { path: '/memo/project/note', content: source },
    ])
  })

  it('rejects the whole selection when any disk File is not .md', async () => {
    const root = directoryHandle([
      ['memo', directoryHandle([
        ['note.md', fileHandle('Markdown')],
        ['app.svelte', fileHandle('<h1>Svelte</h1>')],
      ])],
    ])
    vi.stubGlobal('window', { showDirectoryPicker: async () => root })

    await expect(pickDirectoryWithFilePicker()).rejects.toMatchObject({
      code: 'unsupported_extension',
    })
  })
})
