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
