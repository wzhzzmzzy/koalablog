import { format } from 'date-fns'
import { pickDirectoryWithFilePicker, supportFSApi } from './file-reader'

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename

  document.body.appendChild(a)
  a.click()

  document.body.removeChild(a)
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

export async function exportAllFiles() {
  const response = await fetch('/api/workspace/exchange')
  if (!response.ok)
    throw new Error(`Workspace export failed: ${response.status}`)
  downloadBlob(await response.blob(), `export-all-${format(new Date(), 'yyyyMMdd_HHmmss')}.zip`)
}

export async function pickExchangeArchive() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'application/zip,.zip'
  input.style.display = 'none'
  document.body.appendChild(input)
  try {
    const file = await new Promise<File | null>((resolve) => {
      input.addEventListener('change', () => resolve(input.files?.[0] ?? null), { once: true })
      input.click()
    })
    return file
  }
  finally {
    input.remove()
  }
}

export async function importExchangeArchive(archive: File) {
  const response = await fetch('/api/workspace/exchange', {
    method: 'POST',
    headers: { 'Content-Type': 'application/zip' },
    body: await archive.arrayBuffer(),
  })
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => ({}))
    const message = typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string'
      ? body.error
      : `Workspace import failed: ${response.status}`
    throw new Error(message)
  }
  return response.json() as Promise<{ created: string[], skippedExisting: string[], rebuildRequired: string[] }>
}

export function importFromFilePicker() {
  if (supportFSApi()) {
    return pickDirectoryWithFilePicker()
  }
  else {
    throw new Error('unsupported browser')
  }
}
