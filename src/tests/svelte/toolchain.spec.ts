import { SVELTE_RUNTIME_REGISTRY } from '@/lib/svelte/runtime-registry.generated'
import {
  assertSvelteToolchainProbe,
  SVELTE_TOOLCHAIN_VERSIONS,
  type SvelteToolchainProbe,
} from '@/lib/svelte/toolchain'
import { UNOCSS_CONFIG_HASH } from '@/lib/svelte/unocss-profile'
import { describe, expect, it } from 'vitest'

const validProbe: SvelteToolchainProbe = {
  compilerVersion: SVELTE_TOOLCHAIN_VERSIONS.svelte,
  runtimeVersion: SVELTE_TOOLCHAIN_VERSIONS.svelte,
  rollupVersion: SVELTE_TOOLCHAIN_VERSIONS.rollup,
  svelteLanguageVersion: SVELTE_TOOLCHAIN_VERSIONS.svelteLanguage,
  unocssVersion: SVELTE_TOOLCHAIN_VERSIONS.unocss,
  unocssConfigHash: UNOCSS_CONFIG_HASH,
  compiled: true,
  bundled: true,
  generatedCss: true,
  runtimeImports: ['svelte/internal/client', 'svelte/internal/disclose-version'],
}

describe('svelte browser toolchain', () => {
  it('publishes the exact supported toolchain versions', () => {
    expect(SVELTE_TOOLCHAIN_VERSIONS).toEqual({
      svelte: '5.19.2',
      rollup: '4.28.1',
      svelteLanguage: '6.0.0',
      unocss: '65.4.3',
    })
  })

  it('accepts only a complete probe from the matching compiler and runtime', () => {
    expect(assertSvelteToolchainProbe(validProbe)).toEqual(validProbe)

    expect(() => assertSvelteToolchainProbe({
      ...validProbe,
      runtimeVersion: '5.20.0',
    })).toThrow('Svelte runtime version mismatch')
    expect(() => assertSvelteToolchainProbe({
      ...validProbe,
      bundled: false,
    })).toThrow('Svelte toolchain probe did not bundle the compiled module')
  })

  it('ships the matching browser runtime registry without server or compiler modules', () => {
    expect(SVELTE_RUNTIME_REGISTRY.version).toBe('5.19.2')
    expect(SVELTE_RUNTIME_REGISTRY.entrypoints).toMatchObject({
      'svelte': 'svelte/src/index-client.js',
      'svelte/internal/client': 'svelte/src/internal/client/index.js',
      'svelte/internal/disclose-version': 'svelte/src/internal/disclose-version.js',
    })
    expect(SVELTE_RUNTIME_REGISTRY.modules['svelte/src/internal/client/index.js']).toContain('export')
    expect(Object.keys(SVELTE_RUNTIME_REGISTRY.modules)).not.toContain('svelte/src/index-server.js')
    expect(Object.keys(SVELTE_RUNTIME_REGISTRY.modules).some(path => path.includes('/compiler/'))).toBe(false)
    expect(Object.keys(SVELTE_RUNTIME_REGISTRY.modules).some(path => path.includes('/internal/server/'))).toBe(false)
  })
})
