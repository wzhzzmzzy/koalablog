export interface PendingImage {
  file: File
  placeholder: string
}

export interface ImageBatch {
  items: PendingImage[]
  text: string
}

export interface ImageTextChange {
  from: number
  to: number
  insert: string
}

function safeFileName(name: string) {
  return name.replace(/[\r\n[\]]/g, ' ')
}

function defaultImageId() {
  return globalThis.crypto.randomUUID()
}

export function prepareImageBatch(files: File[], createId: () => string = defaultImageId): ImageBatch {
  const items = files
    .filter(file => file.type.startsWith('image/'))
    .map(file => ({
      file,
      placeholder: `![Uploading ${safeFileName(file.name)}…](koala-upload:${createId()})`,
    }))

  return {
    items,
    text: items.map(item => item.placeholder).join('\n'),
  }
}

function findPlaceholderChange(source: string, pending: PendingImage, insert: string): ImageTextChange | null {
  const from = source.indexOf(pending.placeholder)
  if (from === -1)
    return null
  return {
    from,
    to: from + pending.placeholder.length,
    insert,
  }
}

export function markdownImage(url: string) {
  return `![](${url})`
}

export function findImageReplacement(source: string, pending: PendingImage, url: string) {
  return findPlaceholderChange(source, pending, markdownImage(url))
}

export function findImageRemoval(source: string, pending: PendingImage) {
  return findPlaceholderChange(source, pending, '')
}

export function imagesFromClipboard(event: ClipboardEvent) {
  const files: File[] = []
  for (const item of event.clipboardData?.items ?? []) {
    if (item.kind !== 'file' || !item.type.startsWith('image/'))
      continue
    const file = item.getAsFile()
    if (file)
      files.push(file)
  }
  return files
}

export function imagesFromDrop(event: DragEvent) {
  return Array.from(event.dataTransfer?.files ?? [])
    .filter(file => file.type.startsWith('image/'))
}
