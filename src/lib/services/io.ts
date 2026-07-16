import type { AllCollection } from '@/actions/db/markdown'
import type { Markdown } from '@/db/types'
import { actions } from 'astro:actions'
import { format } from 'date-fns'
import { pickDirectoryWithFilePicker, supportFSApi } from './file-reader'

function createBlob(blobData: Uint8Array<ArrayBufferLike>, chunkSize = 1024 * 1024) {
  const chunks = []

  for (let i = 0; i < blobData.length; i += chunkSize) {
    chunks.push(blobData.slice(i, i + chunkSize))
  }

  return new Blob(chunks, { type: 'application/zip' })
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename

  document.body.appendChild(a)
  a.click()

  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export async function exportAllPosts() {
  const fflateLoader = import('fflate/browser')
  const allMarkdown = await actions.db.markdown.all({ includeTrash: true })
  const data = allMarkdown.data as (AllCollection & { recycleBin?: AllCollection }) | undefined

  if (!data) {
    throw new Error('No data to export')
  }

  const textEncoder = new TextEncoder()

  // 创建文件结构
  const zipFiles: Record<string, Uint8Array> = {}

  // 创建包含meta数据的内容函数
  const createContentWithMeta = (markdown: Markdown) => {
    const meta = {
      subject: markdown.subject,
      link: markdown.link,
      tags: markdown.tags,
      source: markdown.source, // 0=post, 1=page, etc (based on enum or value in DB)
      createdAt: markdown.createdAt,
      updatedAt: markdown.updatedAt,
      private: markdown.private,
      deletedAt: markdown.deletedAt,
    }

    const formatTags = (tags: string | null | undefined) => {
      if (!tags)
        return '[]'
      // 假设 tags 是逗号分隔的字符串
      const tagList = tags.split(',').map(t => t.trim()).filter(Boolean)
      if (tagList.length === 0)
        return '[]'
      return `[${tagList.map(t => `"${t}"`).join(', ')}]`
    }

    const metaHeader = `---
subject: "${meta.subject.replace(/"/g, '\\"')}"
link: "${meta.link}"
tags: ${formatTags(meta.tags)}
source: ${meta.source}
createdAt: "${meta.createdAt.toISOString()}"
updatedAt: "${meta.updatedAt.toISOString()}"
private: ${!!meta.private}
deletedAt: ${meta.deletedAt ? `"${meta.deletedAt.toISOString()}"` : 'null'}
---

`

    return metaHeader + (markdown.content || '')
  }

  const collections = ['posts', 'pages', 'memos', 'wikis'] as const
  const safeName = (markdown: Markdown) => markdown.subject.replace(/[/\\?%*:|"<>]/g, '-')

  for (const collection of collections) {
    data[collection]?.forEach((document) => {
      zipFiles[`${collection}/${safeName(document)}.md`] = textEncoder.encode(createContentWithMeta(document))
    })
    data.recycleBin?.[collection]?.forEach((document) => {
      zipFiles[`recycleBin/${collection}/${safeName(document)}-${document.id}.md`] = textEncoder.encode(createContentWithMeta(document))
    })
  }
  const fflate = await fflateLoader
  return new Promise<void>((resolve, reject) => {
    fflate.zip(zipFiles, (err, data) => {
      if (err) {
        reject(err)
      }
      else {
        downloadBlob(createBlob(data), `export-all-${format(new Date(), 'yyyyMMdd_HHmmss')}.zip`)
        resolve()
      }
    })
  })
}

export function importFromFilePicker() {
  if (supportFSApi()) {
    return pickDirectoryWithFilePicker()
  }
  else {
    throw new Error('unsupported browser')
  }
}
