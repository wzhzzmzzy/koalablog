import { SVELTE_TOOLCHAIN_VERSIONS } from './toolchain-versions'
import { UNOCSS_CONFIG_HASH } from './unocss-profile'

export { SVELTE_TOOLCHAIN_VERSIONS } from './toolchain-versions'
export { UNOCSS_CONFIG_HASH } from './unocss-profile'

export const SVELTE_USER_MODULE_SPECIFIERS = [
  'svelte',
  'svelte/animate',
  'svelte/easing',
  'svelte/events',
  'svelte/legacy',
  'svelte/motion',
  'svelte/reactivity',
  'svelte/reactivity/window',
  'svelte/store',
  'svelte/transition',
] as const

export const SVELTE_DEPENDENCY_LIMITS = {
  maxDepth: 8,
  maxModules: 64,
  maxModuleBytes: 512_000,
  maxTotalBytes: 4_000_000,
  fetchTimeoutMs: 10_000,
  resolutionTimeoutMs: 20_000,
} as const

export interface SvelteToolchainProbe {
  compilerVersion: string
  runtimeVersion: string
  rollupVersion: string
  svelteLanguageVersion: string
  unocssVersion: string
  unocssConfigHash: string
  compiled: boolean
  bundled: boolean
  generatedCss: boolean
  runtimeImports: string[]
}

interface ToolchainProbeResponse {
  type: 'probe-result'
  probe: SvelteToolchainProbe
}

interface ToolchainProbeErrorResponse {
  type: 'probe-error'
  message: string
}

let toolchainProbe: Promise<SvelteToolchainProbe> | null = null

export function assertSvelteToolchainProbe(probe: SvelteToolchainProbe) {
  if (probe.compilerVersion !== SVELTE_TOOLCHAIN_VERSIONS.svelte)
    throw new Error(`Svelte compiler version mismatch: ${probe.compilerVersion}`)
  if (probe.runtimeVersion !== SVELTE_TOOLCHAIN_VERSIONS.svelte)
    throw new Error(`Svelte runtime version mismatch: ${probe.runtimeVersion}`)
  if (probe.rollupVersion !== SVELTE_TOOLCHAIN_VERSIONS.rollup)
    throw new Error(`Rollup browser version mismatch: ${probe.rollupVersion}`)
  if (probe.svelteLanguageVersion !== SVELTE_TOOLCHAIN_VERSIONS.svelteLanguage)
    throw new Error(`Svelte language version mismatch: ${probe.svelteLanguageVersion}`)
  if (probe.unocssVersion !== SVELTE_TOOLCHAIN_VERSIONS.unocss)
    throw new Error(`UnoCSS version mismatch: ${probe.unocssVersion}`)
  if (probe.unocssConfigHash !== UNOCSS_CONFIG_HASH)
    throw new Error(`UnoCSS config hash mismatch: ${probe.unocssConfigHash}`)
  if (!probe.compiled)
    throw new Error('Svelte toolchain probe did not compile the component')
  if (!probe.bundled)
    throw new Error('Svelte toolchain probe did not bundle the compiled module')
  if (!probe.generatedCss)
    throw new Error('Svelte toolchain probe did not generate UnoCSS')
  if (probe.runtimeImports.length === 0)
    throw new Error('Svelte toolchain probe did not resolve runtime imports')
  return probe
}

export function probeSvelteToolchain() {
  if (toolchainProbe)
    return toolchainProbe

  toolchainProbe = new Promise<SvelteToolchainProbe>((resolve, reject) => {
    const worker = new Worker(new URL('../../workers/svelte/artifact.worker.ts', import.meta.url), {
      name: 'koala-svelte-artifact',
      type: 'module',
    })
    const timeout = window.setTimeout(() => {
      worker.terminate()
      reject(new Error('Svelte toolchain probe timed out'))
    }, 20_000)

    function finish() {
      window.clearTimeout(timeout)
      worker.terminate()
    }

    worker.addEventListener('error', (event) => {
      finish()
      reject(new Error(event.message || 'Svelte toolchain Worker failed'))
    }, { once: true })
    worker.addEventListener('message', (event: MessageEvent<ToolchainProbeResponse | ToolchainProbeErrorResponse>) => {
      finish()
      if (event.data.type === 'probe-error') {
        reject(new Error(event.data.message))
        return
      }
      try {
        resolve(assertSvelteToolchainProbe(event.data.probe))
      }
      catch (error) {
        reject(error)
      }
    }, { once: true })
    worker.postMessage({ type: 'probe' })
  }).catch((error) => {
    toolchainProbe = null
    throw error
  })

  return toolchainProbe
}
