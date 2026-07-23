import type { AllCollection } from '@/actions/db/markdown'
import { flattenFileCollections } from '@/lib/files/collection'
import { fileExportEntries } from '@/lib/files/disk'
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

export async function exportAllFiles() {
  const fflateLoader = import('fflate/browser')
  const allMarkdown = await actions.db.markdown.all({ includeTrash: false })
  const data = allMarkdown.data as AllCollection | undefined

  if (!data) {
    throw new Error('No data to export')
  }

  const textEncoder = new TextEncoder()

  const files = flattenFileCollections(data)
  const zipFiles = Object.fromEntries(
    Object.entries(fileExportEntries(files)).map(([path, source]) => [path, textEncoder.encode(source)]),
  )
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
