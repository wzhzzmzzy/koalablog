import type { Plugin } from '@rollup/browser'
import type { SvelteToolchainProbe } from '../../lib/svelte/toolchain'
import { SVELTE_RUNTIME_REGISTRY } from '../../lib/svelte/runtime-registry.generated'
import { SVELTE_TOOLCHAIN_VERSIONS } from '../../lib/svelte/toolchain-versions'

const PROBE_MODULE_ID = '\0koala-svelte-toolchain-probe'
const PROBE_SOURCE = '<h1 class="text-red-500">Koala</h1>'

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

globalThis.addEventListener('message', async (event: MessageEvent<{ type?: string }>) => {
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
