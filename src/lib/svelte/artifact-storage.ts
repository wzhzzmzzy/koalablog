import type { SvelteArtifactHashes } from './contracts'
import { serializeJavascriptResource, sha256Hex, utf8ByteLength } from './artifact-hash'

export function artifactObjectKey(fileId: number, resourceHash: string, field: 'javascript' | 'css') {
  return `render-artifacts/${fileId}/${resourceHash}/${field === 'javascript' ? 'module.js' : 'styles.css'}`
}

export type ArtifactStorageMode = 'd1' | 'r2'

export async function storeArtifactResources(env: Env, artifact: SvelteArtifactHashes & { fileId: number, javascript: string, css: string }, mode: ArtifactStorageMode = 'd1') {
  if (mode === 'd1')
    return { javascript: artifact.javascript, css: artifact.css, javascriptKey: null, cssKey: null }
  if (!env.OSS)
    throw new Error('Artifact storage requires the private OSS binding')

  const javascript = serializeJavascriptResource(artifact.javascript)
  const javascriptKey = artifactObjectKey(artifact.fileId, artifact.javascriptResourceHash, 'javascript')
  const cssKey = artifactObjectKey(artifact.fileId, artifact.cssResourceHash, 'css')
  for (const [key, body, hash, contentType] of [
    [javascriptKey, javascript, artifact.javascriptResourceHash, 'text/javascript; charset=utf-8'],
    [cssKey, artifact.css, artifact.cssResourceHash, 'text/css; charset=utf-8'],
  ]) {
    const object = await env.OSS.put(key, body, { sha256: hash, httpMetadata: { contentType } })
    if (!object || object.size !== utf8ByteLength(body))
      throw new Error('Artifact object upload was not confirmed')
  }
  return { javascript: '', css: '', javascriptKey, cssKey }
}

export async function verifyArtifactResource(env: Env, key: string, hash: string) {
  const object = await env.OSS?.get(key)
  if (!object)
    throw new Error('Artifact object is missing')
  const body = await object.text()
  if (await sha256Hex(body) !== hash)
    throw new Error('Artifact object verification failed')
  return body
}
