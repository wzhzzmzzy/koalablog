import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { bundleSvelteArtifact } from '@/workers/svelte/bundler'
import { compileSvelteSource } from '@/workers/svelte/compiler'
import { afterEach, describe, expect, it, vi } from 'vitest'

const moduleRequire = createRequire(import.meta.url)
const rollupBrowserPath = moduleRequire.resolve('@rollup/browser')
const rollupWasmPath = path.join(path.dirname(rollupBrowserPath), 'bindings_wasm_bg.wasm')

afterEach(() => {
  vi.unstubAllGlobals()
})

function useLocalRollupWasm() {
  const fetch = globalThis.fetch
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).endsWith('bindings_wasm_bg.wasm')) {
      return new Response(await readFile(rollupWasmPath), {
        headers: { 'content-type': 'application/wasm' },
      })
    }
    return fetch(input, init)
  })
}

describe('svelte Artifact bundler', () => {
  it('inlines the pinned runtime and literal HTTPS dynamic modules into a named IIFE', async () => {
    const source = `<script>
  import { writable } from 'svelte/store'
  import { fade } from 'svelte/transition'

  const message = writable('Koala')
  const later = import('https://modules.example.test/later.js')
</script>

{#if $message}<h1 transition:fade>{$message}</h1>{/if}
{#await later then value}<p>{value.message}</p>{/await}

<style>h1 { color: rebeccapurple; }</style>`
    const compiled = await compileSvelteSource(source)

    if (!compiled.ok)
      throw new Error(JSON.stringify(compiled))
    useLocalRollupWasm()
    const result = await bundleSvelteArtifact({
      javascript: compiled.javascript,
      modules: new Map([['https://modules.example.test/later.js', 'export const message = \'remote\'']]),
    })

    if (!result.ok)
      throw new Error(result.message)
    expect(result.value.javascript).toMatch(/^\(function \(exports\)/)
    expect(result.value.javascript).toContain('exports.mount = mount')
    expect(result.value.javascript).toContain('exports.unmount = unmount')
    expect(result.value.javascript).not.toContain('https://modules.example.test/later.js')
    expect(result.value.javascript).not.toContain('rebeccapurple')
    expect(result.value.runtimeImports).toEqual(expect.arrayContaining([
      'svelte/internal/client',
      'svelte/store',
      'svelte/transition',
    ]))
  })
})
