import type { DiskSourceFile } from '@/lib/files/disk'
import { actions, deserializeActionResult, getActionPath } from 'astro:actions'
import { FileDiskError, fileFromDiskPath } from '@/lib/files/disk'

export function supportFSApi(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window
}

interface ShowOpenFilePickerOptions {

}

type showOpenFilePicker = (opt: ShowOpenFilePickerOptions) => Promise<Array<FileSystemFileHandle>>

export interface FileUploadProgress {
  loaded: number
  total: number
}

function uploadActionWithProgress(
  formData: FormData,
  onProgress: (progress: FileUploadProgress) => void,
): ReturnType<typeof actions.oss.upload> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open('POST', getActionPath(actions.oss.upload))
    request.setRequestHeader('Accept', 'application/json')
    request.upload.addEventListener('progress', (event) => {
      onProgress({
        loaded: event.loaded,
        total: event.lengthComputable ? event.total : 0,
      })
    })
    request.addEventListener('load', () => {
      try {
        if (request.status === 204) {
          resolve(deserializeActionResult({ type: 'empty', status: 204 }))
          return
        }
        const result = request.status >= 200 && request.status < 300
          ? deserializeActionResult({
              type: 'data',
              body: request.responseText,
              status: 200,
              contentType: 'application/json+devalue',
            })
          : deserializeActionResult({
              type: 'error',
              body: request.responseText,
              status: request.status,
              contentType: 'application/json',
            })
        resolve(result)
      }
      catch (error) {
        reject(error)
      }
    })
    request.addEventListener('error', () => reject(new Error('Upload failed because the network request could not be completed.')))
    request.addEventListener('abort', () => reject(new Error('Upload was cancelled.')))
    request.send(formData)
  })
}

export function uploadFile(
  source: 'article' | 'oss',
  file: File | FileList | Blob,
  name?: string,
  onProgress?: (progress: FileUploadProgress) => void,
) {
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
  return onProgress
    ? uploadActionWithProgress(formData, onProgress)
    : actions.oss.upload(formData)
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

export async function pickFileWithFileInput(accept: string = 'image/*', multiple = false) {
  const fileInput = document.createElement('input')
  fileInput.type = 'file'
  fileInput.accept = accept
  fileInput.multiple = multiple
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

export async function pickDirectoryWithFilePicker(): Promise<DiskSourceFile[]> {
  const directoryHandler = await (window as any).showDirectoryPicker()
  const files: DiskSourceFile[] = []
  const selectedPaths = new Set<string>()

  async function readDirectory(dirHandler: any, basePath = '') {
    for await (const [name, handle] of dirHandler.entries()) {
      if (handle.kind === 'file') {
        const diskPath = basePath ? `${basePath}/${name}` : name
        const { path, renderer } = fileFromDiskPath(diskPath)
        if (selectedPaths.has(path))
          throw new FileDiskError('duplicate_disk_path', `Multiple selected disk Files map to File Path: ${path}`)
        selectedPaths.add(path)
        try {
          const file = await handle.getFile()
          const content = await file.text()
          files.push({ path, renderer, content })
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
  return files
}
