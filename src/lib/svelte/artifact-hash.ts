import type { SvelteArtifactHashes, SvelteArtifactInputV1, SvelteDependencyManifestEntry } from './contracts'

export const SVELTE_ARTIFACT_SERIALIZATION_VERSION = 'koala-artifact-v1'
export const SVELTE_JAVASCRIPT_RESOURCE_VERSION = 'koala-js-v1'

function bytes(value: string) {
  return new TextEncoder().encode(value)
}

function hexadecimal(value: ArrayBuffer) {
  return Array.from(new Uint8Array(value), byte => byte.toString(16).padStart(2, '0')).join('')
}

export function utf8ByteLength(value: string) {
  return bytes(value).byteLength
}

export async function sha256Hex(value: string) {
  return hexadecimal(await globalThis.crypto.subtle.digest('SHA-256', bytes(value)))
}

export function canonicalDependencies(dependencies: readonly SvelteDependencyManifestEntry[]) {
  return [...dependencies]
    .map(dependency => ({ bytes: dependency.bytes, sha256: dependency.sha256, url: dependency.url }))
    .sort((left, right) => left.url.localeCompare(right.url))
}

export function serializeArtifactPayload(input: SvelteArtifactInputV1) {
  return JSON.stringify([
    SVELTE_ARTIFACT_SERIALIZATION_VERSION,
    input.svelteVersion,
    input.unocssVersion,
    input.unocssConfigHash,
    input.sourceHash,
    canonicalDependencies(input.dependencies),
    input.javascript,
    input.css,
    input.snapshotHtml,
  ])
}

export function serializeJavascriptResource(javascript: string) {
  return `const artifact = ${javascript};\nexport async function mountKoalaArtifact(target) {\n  const instance = artifact.mount(target);\n  return { unmount: () => artifact.unmount(instance) };\n}\n`
}

export async function calculateArtifactHashes(input: SvelteArtifactInputV1): Promise<SvelteArtifactHashes> {
  const javascriptResource = serializeJavascriptResource(input.javascript)
  const [artifactHash, javascriptResourceHash, cssResourceHash] = await Promise.all([
    sha256Hex(serializeArtifactPayload(input)),
    sha256Hex(javascriptResource),
    sha256Hex(input.css),
  ])
  return { artifactHash, javascriptResourceHash, cssResourceHash }
}
