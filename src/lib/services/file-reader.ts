import type { Markdown } from '@/db/types'
import to from 'await-to-js'
import { ofetch } from 'ofetch'

export function supportFSApi(): boolean {
  return typeof window !== 'undefined' && 'showOpenFilePicker' in window
}

interface ShowOpenFilePickerOptions {

}

type showOpenFilePicker = (opt: ShowOpenFilePickerOptions) => Promise<Array<FileSystemFileHandle>>

export async function pickFileWithFSApi() {
  const [err, fileHandle] = await to(((window as any).showOpenFilePicker as showOpenFilePicker)({
    id: 'import',
    types: [{
      description: 'Text files',
      accept: {
        'text/plain': ['.txt', '.md', '.markdown', '.mdx', '.mkd', '.mdown', '.mdwn'],
      },
    }],
    multiple: false,
  }))

  if (err) {
    // eslint-disable-next-line no-console
    console.log('file picker error', err)
    return
  }

  const file = await fileHandle![0].getFile()
  const subject = file.name
  const content = await file.text()

  const [updateErr, res] = await to(ofetch<{ payload: Markdown }>('/api/db/post', {
    method: 'POST',
    body: {
      subject,
      content,
    },
  }))

  if (updateErr) {
    // eslint-disable-next-line no-console
    console.log('Add post failed', updateErr)
    return
  }

  return res
}
