import type { Markdown } from '@/db/types'
import to from 'await-to-js'
import consola from 'consola'
import { ofetch } from 'ofetch'

export function supportFSApi(): boolean {
  return typeof window !== 'undefined' && 'showOpenFilePicker' in window
}

interface ShowOpenFilePickerOptions {

}

type showOpenFilePicker = (opt: ShowOpenFilePickerOptions) => Promise<Array<FileSystemFileHandle>>

export async function pickImageFileWithFileInput() {
  const fileInput = document.getElementById('fileInput')
  const files = (fileInput as HTMLInputElement).files

  if (!files || files.length === 0) {
    return
  }

  const formData = new FormData()
  for (let i = 0; i < files.length; i++) {
    formData.append('file', files[i])
  }

  const res = await ofetch(`/api/oss/test.png`, {
    method: 'PUT',
    body: formData,
  })
  consola.info(res)
}

export async function pickImageFileWithFSApi() {
  const [err, fileHandle] = await to(((window as any).showOpenFilePicker as showOpenFilePicker)({
    id: 'import',
    types: [{
      description: 'Image',
      accept: {
        'image/*': ['.png', '.gif', '.jpeg', '.jpg', '.webp', '.heic', '.heif'],
      },
    }],
    multiple: false,
  }))

  if (err) {
    // eslint-disable-next-line no-console
    console.log('file picker error', err)
  }

  const file = await fileHandle![0].getFile()
  const subject = file.name

  console.log(file)

  const res = await ofetch(`/api/oss/${subject}`, {
    method: 'POST',
    body: file,
    headers: {
      'Content-Type': file.type,
      'Content-Length': String(file.size),
    },
  })

  console.log(res)
}

export async function pickMDFileWithFSApi() {
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
