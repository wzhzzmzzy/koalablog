import { actions } from 'astro:actions'

export function supportFSApi(): boolean {
  return typeof window !== 'undefined' && 'showOpenFilePicker' in window
}

interface ShowOpenFilePickerOptions {

}

type showOpenFilePicker = (opt: ShowOpenFilePickerOptions) => Promise<Array<FileSystemFileHandle>>

export function uploadFile(source: 'article' | 'oss', file: File | FileList | Blob, name?: string) {
  const formData = new FormData()
  if (file instanceof File) {
    formData.append('file', file)
  }
  else if (file instanceof Blob) {
    formData.append('file', file)
  }
  else {
    for (let i = 0; i < file.length; i++) {
      formData.append('file', file[i])
    }
  }
  formData.append('source', source)
  if (name) {
    formData.append('name', name)
  }
  return actions.oss.upload(formData)
}

export function convertToWebP(file: File | string, quality = 0.8) {
  return new Promise<Blob>((resolve, reject) => {
    // 创建图片对象
    const img = new Image()

    img.onload = function () {
      // 创建canvas元素
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')!

      // 设置canvas尺寸
      canvas.width = img.width
      canvas.height = img.height

      // 绘制图片到canvas
      ctx.drawImage(img, 0, 0)

      // 转换为WebP格式
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob)
        }
      }, 'image/webp', quality)
    }

    img.onerror = () => reject(new Error('图片加载失败'))

    // 加载图片
    if (file instanceof File) {
      img.src = URL.createObjectURL(file)
    }
    else {
      img.src = file // 图片URL
    }
  })
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

export async function pickDirectoryWithFilePicker(): Promise<Array<{ subject: string, content: string }>> {
  const directoryHandler = await (window as any).showDirectoryPicker()
  const mdFiles: Array<{ subject: string, content: string }> = []

  async function readDirectory(dirHandler: any, basePath = '') {
    for await (const [name, handle] of dirHandler.entries()) {
      if (handle.kind === 'file' && name.endsWith('.md')) {
        try {
          const file = await handle.getFile()
          const content = await file.text()
          const fileName = basePath ? `${basePath}/${name}` : name
          // 移除 .md 后缀作为 subject
          const subject = fileName.replace(/\.md$/, '')
          mdFiles.push({ subject, content })
        }
        catch (error) {
          console.warn(`Failed to read file ${name}:`, error)
        }
      }
      else if (handle.kind === 'directory') {
        // 递归读取子目录
        const subPath = basePath ? `${basePath}/${name}` : name
        await readDirectory(handle, subPath)
      }
    }
  }

  await readDirectory(directoryHandler)
  return mdFiles
}
