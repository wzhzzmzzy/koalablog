import type { AllCollection } from '@/actions/db/markdown'
import type { Markdown } from '@/db/types'
import { actions } from 'astro:actions'
import { format } from 'date-fns'
import { pickMDFileWithFSApi, supportFSApi } from './file-reader'

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
  const allMarkdown = await actions.db.markdown.all({ deleted: true })
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
      link: markdown.link,
      tags: markdown.tags,
      createdAt: markdown.createdAt,
      updatedAt: markdown.updatedAt,
      deleted: markdown.deleted,
    }

    const metaHeader = `---
meta:
  link: "${meta.link}"
  tags: ${meta.tags ? `"${meta.tags}"` : 'null'}
  createdAt: "${meta.createdAt.toISOString()}"
  updatedAt: "${meta.updatedAt.toISOString()}"
  deleted: ${meta.deleted}
---

`

    return metaHeader + (markdown.content || '')
  }

  // 处理 posts
  if (data.posts) {
    data.posts.forEach((post: Markdown) => {
      const filename = `posts/${post.subject.replace(/[/\\?%*:|"<>]/g, '-')}.md`
      zipFiles[filename] = textEncoder.encode(createContentWithMeta(post))
    })
  }

  // 处理 pages
  if (data.pages) {
    data.pages.forEach((page: Markdown) => {
      const filename = `pages/${page.subject.replace(/[/\\?%*:|"<>]/g, '-')}.md`
      zipFiles[filename] = textEncoder.encode(createContentWithMeta(page))
    })
  }

  // 处理 home
  if (data.home) {
    zipFiles['home/home.md'] = textEncoder.encode(createContentWithMeta(data.home))
  }

  // 处理 nav
  if (data.nav) {
    zipFiles['nav/nav.md'] = textEncoder.encode(createContentWithMeta(data.nav))
  }

  // 处理回收站
  if (data.recycleBin) {
    if (data.recycleBin.posts) {
      data.recycleBin.posts.forEach((post: Markdown) => {
        const filename = `recycleBin/posts/${post.subject.replace(/[/\\?%*:|"<>]/g, '-')}.md`
        zipFiles[filename] = textEncoder.encode(createContentWithMeta(post))
      })
    }

    if (data.recycleBin.pages) {
      data.recycleBin.pages.forEach((page: Markdown) => {
        const filename = `recycleBin/pages/${page.subject.replace(/[/\\?%*:|"<>]/g, '-')}.md`
        zipFiles[filename] = textEncoder.encode(createContentWithMeta(page))
      })
    }
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
    return pickMDFileWithFSApi()
    // return pickMDFileWithFSApi()
  }
  else {
    return 'unsupported browser'
  }
}
