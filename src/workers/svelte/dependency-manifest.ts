import type { SvelteDependencyManifestEntry } from '../../lib/svelte/contracts'

const encoder = new TextEncoder()

function copyToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return buffer
}

export function utf8Bytes(value: string) {
  return encoder.encode(value)
}

export async function sha256Hex(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest('SHA-256', copyToArrayBuffer(bytes))
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

export async function dependencyManifestEntry(url: string, source: string): Promise<SvelteDependencyManifestEntry> {
  const bytes = utf8Bytes(source)
  return {
    url,
    bytes: bytes.byteLength,
    sha256: await sha256Hex(bytes),
  }
}

export function canonicalDependencyManifest(entries: SvelteDependencyManifestEntry[]) {
  return [...entries].sort((left, right) => left.url.localeCompare(right.url))
}
