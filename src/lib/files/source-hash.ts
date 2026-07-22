import { isRendererMode, type RendererMode } from './types'

const SOURCE_HASH_SCHEMA = 'koala-source-v1'

function hexadecimal(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('')
}

export async function calculateSourceHash(renderer: RendererMode, content: string): Promise<string> {
  if (!isRendererMode(renderer))
    throw new TypeError(`Unsupported File Renderer: ${renderer}`)
  if (typeof content !== 'string')
    throw new TypeError('File Source content must be a string')

  const payload = JSON.stringify([SOURCE_HASH_SCHEMA, renderer, content])
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload))
  return hexadecimal(digest)
}
