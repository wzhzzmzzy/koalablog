import { RENDERER_MODE, type RendererMode } from '@/lib/files/types'

export interface PendingImage {
  file: File
  renderer: RendererMode
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

function safeMarkdownFileName(name: string) {
  return name.replace(/[\r\n[\]]/g, ' ')
}

function defaultImageId() {
  return globalThis.crypto.randomUUID()
}

function imagePlaceholder(renderer: RendererMode, fileName: string, id: string) {
  const safeFileName = renderer === RENDERER_MODE.Svelte
    ? fileName.replace(/[\r\n]/g, ' ')
    : safeMarkdownFileName(fileName)
  return formatImageMarkup(renderer, `koala-upload:${id}`, `Uploading ${safeFileName}…`)
}

export function prepareImageBatch(
  files: File[],
  renderer: RendererMode,
  createId: () => string = defaultImageId,
): ImageBatch {
  const items = files
    .filter(file => file.type.startsWith('image/'))
    .map(file => ({
      file,
      renderer,
      placeholder: imagePlaceholder(renderer, file.name, createId()),
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

function escapeSvelteAttribute(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('{', '&#123;')
    .replaceAll('}', '&#125;')
}

function formatImageMarkup(renderer: RendererMode, src: string, alt: string) {
  if (renderer === RENDERER_MODE.Svelte)
    return `<img src="${escapeSvelteAttribute(src)}" alt="${escapeSvelteAttribute(alt)}" />`
  return `![${alt}](${src})`
}

export function imageMarkup(renderer: RendererMode, url: string) {
  return formatImageMarkup(renderer, url, '')
}

export function findImageReplacement(source: string, pending: PendingImage, url: string) {
  return findPlaceholderChange(source, pending, imageMarkup(pending.renderer, url))
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
