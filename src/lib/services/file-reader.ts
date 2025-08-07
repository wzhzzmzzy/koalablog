import type { Markdown } from '@/db/types'
import { actions } from 'astro:actions'
import to from 'await-to-js'
import { ofetch } from 'ofetch'

export function supportFSApi(): boolean {
  return typeof window !== 'undefined' && 'showOpenFilePicker' in window
}

interface ShowOpenFilePickerOptions {

}

type showOpenFilePicker = (opt: ShowOpenFilePickerOptions) => Promise<Array<FileSystemFileHandle>>

export function uploadFile(source: 'post' | 'page' | 'preset', file: File | FileList) {
  const formData = new FormData()
  if (file instanceof File) {
    formData.append('file', file)
  }
  else {
    for (let i = 0; i < file.length; i++) {
      formData.append('file', file[i])
    }
  }
  formData.append('source', source)
  return actions.oss.upload(formData)
}

export async function pickFileWithFileInput(accept: string = 'image/*') {
  const fileInput = document.createElement('input')
  fileInput.type = 'file'
  fileInput.accept = accept
  fileInput.style.display = 'none'
  document.body.insertAdjacentElement('afterend', fileInput)
  fileInput.click()
  return new Promise<FileList>((resolve) => {
    fileInput.addEventListener('change', (event: Event) => {
      const files = (event.target as HTMLInputElement)!.files as FileList
      resolve(files)
      setTimeout(() => {
        fileInput.remove()
      }, 500)
    })
  })
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
