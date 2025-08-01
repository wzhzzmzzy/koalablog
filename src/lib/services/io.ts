import type { Markdown } from '@/db/types'
import { format } from 'date-fns'
import { zip } from 'fflate'
import { ofetch } from 'ofetch'

function createBlob(blobData: Uint8Array<ArrayBufferLike>) {
  return new Blob([blobData], { type: 'application/zip' })
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
  const req = new Request('/api/db/post?all=true', {
    method: 'GET',
    credentials: 'same-origin',
  })
  const posts = await ofetch<{ payload: Markdown[] }>(req, { parseResponse: JSON.parse })

  return new Promise((resolve, reject) => {
    zip({
      posts: posts.payload.reduce((prev, curr) => {
        const textEncoder = new TextEncoder()
        prev[`${curr.subject}.md`] = textEncoder.encode(curr.content || '')

        return prev
      }, {} as Record<string, Uint8Array>),
    }, (err, data) => {
      if (err) {
        reject(err)
      }
      else {
        downloadBlob(createBlob(data), `export-posts-${format(new Date(), 'yyyyMMdd_HH_mm_ss')}`)
      }
    })
  })
}

export function importFromFile() {

}
