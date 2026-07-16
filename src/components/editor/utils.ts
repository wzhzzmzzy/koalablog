import type { FileRecord } from '@/db/types'
import { convertToWebP, uploadFile } from '@/lib/services/file-reader'

/**
 * 从剪贴板事件中提取图片文件
 */
export function getImagesFromClipboard(e: ClipboardEvent): File[] {
  const files: File[] = []
  if (e.clipboardData && e.clipboardData.items) {
    for (const item of e.clipboardData.items) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (file)
          files.push(file)
      }
    }
  }
  return files
}

/**
 * 从拖拽事件中提取图片文件
 */
export function getImagesFromDrop(e: DragEvent): File[] {
  const files: File[] = []
  if (e.dataTransfer && e.dataTransfer.files) {
    for (let i = 0; i < e.dataTransfer.files.length; i++) {
      const file = e.dataTransfer.files[i]
      if (file.type.startsWith('image/')) {
        files.push(file)
      }
    }
  }
  return files
}

/**
 * 在指定位置插入文本
 */
export function insertTextAtPosition(originalText: string, textToInsert: string, position: number): string {
  const before = originalText.substring(0, position)
  const after = originalText.substring(position)
  return before + textToInsert + after
}

/**
 * 生成唯一的图片上传占位符
 */
export function generatePlaceholder(fileName: string): string {
  // 使用时间戳防止同名文件冲突
  const uniqueId = Date.now().toString().slice(-4)
  return `![Uploading ${fileName} (${uniqueId})...]()`
}

export async function uploadEditorImage(file: File) {
  const blob = await convertToWebP(file)
  const extension = blob.type === 'image/webp' ? '.webp' : '.png'
  const fileName = file.name.replace(/\.[^/.]+$/, extension)
  const result = await uploadFile('article', blob, fileName)

  if (result.error)
    throw new Error(result.error.message)
  if (!result.data)
    throw new Error('Upload failed')

  const [source, key] = result.data.split('/')
  return `![](/api/oss/${source}_${key})`
}

export function formatActionError(message: string) {
  const prefix = 'Failed to validate: '
  if (!message?.startsWith(prefix))
    return message

  try {
    const errors = JSON.parse(message.slice(prefix.length))
    if (!Array.isArray(errors))
      return message

    const fieldNames: Record<string, string> = {
      path: 'File Path',
      content: 'Content',
      private: 'Visibility',
      id: 'ID',
      baseRevision: 'Base revision',
    }
    return errors.map((error: { path?: string[], message: string }) => {
      const field = error.path?.[0]
      return `${field ? (fieldNames[field] || field) : 'Error'}: ${error.message}`
    }).join('\n')
  }
  catch {
    return message
  }
}

export function findPreviousActiveDocument(history: string[], files: FileRecord[]) {
  const previousPath = history.at(-2)
  return files.find(file => !file.deletedAt && file.path === previousPath)
}
