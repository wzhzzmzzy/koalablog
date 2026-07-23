import { calculateArtifactHashes, canonicalDependencies, serializeArtifactPayload, serializeJavascriptResource } from '@/lib/svelte/artifact-hash'
import { describe, expect, it } from 'vitest'

const artifact = {
  css: '.koala { color: rebeccapurple; }',
  dependencies: [
    { bytes: 9, sha256: 'b'.repeat(64), url: 'https://modules.example.test/z.js' },
    { bytes: 7, sha256: 'a'.repeat(64), url: 'https://modules.example.test/a.js' },
  ],
  javascript: '({ mount(target) { target.textContent = "Koala"; return {}; }, unmount() {} })',
  renderer: 'svelte' as const,
  schemaVersion: 1 as const,
  snapshotHtml: '<p>Koala</p>',
  sourceHash: 'c'.repeat(64),
  svelteVersion: '5.19.2',
  unocssConfigHash: 'd'.repeat(64),
  unocssVersion: '65.4.3',
}

describe('svelte Artifact serialization', () => {
  it('sorts the dependency manifest and hashes the immutable representations', async () => {
    expect(canonicalDependencies(artifact.dependencies).map(dependency => dependency.url)).toEqual([
      'https://modules.example.test/a.js',
      'https://modules.example.test/z.js',
    ])
    expect(serializeArtifactPayload(artifact)).toBe(JSON.stringify([
      'koala-artifact-v1',
      '5.19.2',
      '65.4.3',
      'd'.repeat(64),
      'c'.repeat(64),
      canonicalDependencies(artifact.dependencies),
      artifact.javascript,
      artifact.css,
      artifact.snapshotHtml,
    ]))
    expect(serializeJavascriptResource(artifact.javascript)).toBe(`const artifact = ${artifact.javascript};\nexport async function mountKoalaArtifact(target) {\n  const instance = artifact.mount(target);\n  return { unmount: () => artifact.unmount(instance) };\n}\n`)
    await expect(calculateArtifactHashes(artifact)).resolves.toEqual({
      artifactHash: '90138bfa4111320ec4bf1bcc8678d5d7ebc0282fabc32d5e407d0d981bfd4c53',
      cssResourceHash: '5a6f63df13598e7cfa0ae29dbe4d888c4ee927936b485e9c03dc2ba69f74a1cd',
      javascriptResourceHash: '9b20c1dc83ea2c5e3c32499c583b176a2ea5697099c83a5b3538bc4ea5bb1fe3',
    })
  })
})
