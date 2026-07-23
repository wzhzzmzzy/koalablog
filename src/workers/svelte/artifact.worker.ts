import type { Plugin } from '@rollup/browser'
import type { SvelteWorkerRequest } from '../../lib/svelte/contracts'
import type { SvelteToolchainProbe } from '../../lib/svelte/toolchain'
import { SVELTE_RUNTIME_REGISTRY } from '../../lib/svelte/runtime-registry.generated'
import { SVELTE_TOOLCHAIN_VERSIONS } from '../../lib/svelte/toolchain-versions'
import { compileSvelteSource } from './compiler'
import { createDependencyFetchLifecycle } from './dependency-lifecycle'

const PROBE_MODULE_ID = '\0koala-svelte-toolchain-probe'
const PROBE_SOURCE = '<h1 class="text-red-500">Koala</h1>'
const dependencyFetches = createDependencyFetchLifecycle()

async function compileWorkerRequest(request: SvelteWorkerRequest) {
  const dependencySignal = dependencyFetches.begin(request.requestId)
  if (dependencySignal.aborted)
    return
  const result = await compileSvelteSource(request.source)
  if (dependencySignal.aborted)
    return
  if (request.type === 'diagnose') {
    globalThis.postMessage({
      type: 'diagnose-result',
      requestId: request.requestId,
      diagnostics: result.ok ? result.warnings : [result.error, ...result.warnings],
    })
    return
  }
  if (result.ok) {
    globalThis.postMessage({
      type: 'build-success',
      requestId: request.requestId,
      javascript: result.javascript,
      css: result.css,
      warnings: result.warnings,
    })
    return
  }
  globalThis.postMessage({
    type: 'build-error',
    requestId: request.requestId,
    error: result.error,
    warnings: result.warnings,
  })
}

function isSvelteWorkerRequest(message: { type?: string } | SvelteWorkerRequest): message is SvelteWorkerRequest {
  return (message.type === 'diagnose' || message.type === 'build')
    && 'requestId' in message
    && 'source' in message
}

async function runToolchainProbe(): Promise<SvelteToolchainProbe> {
  const [rollupBrowser, unocssCore, unocssPreset, svelteCompiler] = await Promise.all([
    import('@rollup/browser'),
    import('@unocss/core'),
    import('@unocss/preset-uno'),
    import('svelte/compiler'),
  ])
  const { VERSION: ROLLUP_VERSION, rollup } = rollupBrowser
  const { createGenerator } = unocssCore
  const { default: presetUno } = unocssPreset
  const { compile, VERSION: SVELTE_VERSION } = svelteCompiler
  const compiled = compile(PROBE_SOURCE, {
    css: 'external',
    dev: false,
    filename: 'App.svelte',
    generate: 'client',
  })
  const runtimeImports = new Set<string>()
  const probePlugin: Plugin = {
    name: 'koala-svelte-toolchain-probe',
    resolveId(source) {
      if (source === PROBE_MODULE_ID)
        return PROBE_MODULE_ID
      if (source in SVELTE_RUNTIME_REGISTRY.entrypoints) {
        runtimeImports.add(source)
        return { id: source, external: true }
      }
      return null
    },
    load(id) {
      return id === PROBE_MODULE_ID ? compiled.js.code : null
    },
  }
  const bundle = await rollup({ input: PROBE_MODULE_ID, plugins: [probePlugin] })
  let bundled = false
  try {
    const output = await bundle.generate({ format: 'es' })
    bundled = output.output.some(item => item.type === 'chunk' && item.code.includes('Koala'))
  }
  finally {
    await bundle.close()
  }

  const uno = await createGenerator({ presets: [presetUno()] })
  const generated = await uno.generate(PROBE_SOURCE, { preflights: false })

  return {
    compilerVersion: SVELTE_VERSION,
    runtimeVersion: SVELTE_RUNTIME_REGISTRY.version,
    rollupVersion: ROLLUP_VERSION,
    svelteLanguageVersion: SVELTE_TOOLCHAIN_VERSIONS.svelteLanguage,
    unocssVersion: SVELTE_TOOLCHAIN_VERSIONS.unocss,
    compiled: compiled.js.code.length > 0,
    bundled,
    generatedCss: generated.matched.has('text-red-500'),
    runtimeImports: [...runtimeImports].sort(),
  }
}

globalThis.addEventListener('message', async (event: MessageEvent<{ type?: string } | SvelteWorkerRequest>) => {
  if (isSvelteWorkerRequest(event.data)) {
    void compileWorkerRequest(event.data)
    return
  }
  if (event.data.type !== 'probe')
    return
  try {
    globalThis.postMessage({ type: 'probe-result', probe: await runToolchainProbe() })
  }
  catch (error) {
    globalThis.postMessage({
      type: 'probe-error',
      message: error instanceof Error ? error.message : String(error),
    })
  }
})
