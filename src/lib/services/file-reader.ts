import { actions } from 'astro:actions'

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

export const IMAGE_EXTENSIONS = {
  'image/*': ['.png', '.gif', '.jpeg', '.jpg', '.webp', '.heic', '.heif'],
}

export const MARKDOWN_EXTENSIONS = {
  'text/plain': ['.txt', '.md', '.markdown', '.mdx', '.mkd', '.mdown', '.mdwn'],
}

export async function pickFileWithFilePicker(accept: Record<string, string[]> = IMAGE_EXTENSIONS) {
  const fileHandle = await ((window as any).showOpenFilePicker as showOpenFilePicker)({
    id: 'import',
    types: [{
      description: 'Image',
      accept,
    }],
    multiple: false,
  })
  return fileHandle![0].getFile()
}

export async function pickDirectoryWithFilePicker() {
  const directoryHandler = await (window as any).showDirectoryPicker()

  return directoryHandler
}
