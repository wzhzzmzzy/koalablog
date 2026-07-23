import type { SvelteWorkerRequest } from '../../lib/svelte/contracts'
import type { SvelteToolchainProbe } from '../../lib/svelte/toolchain'
import { SVELTE_RUNTIME_REGISTRY } from '../../lib/svelte/runtime-registry.generated'
import { SVELTE_TOOLCHAIN_VERSIONS } from '../../lib/svelte/toolchain-versions'
import { UNOCSS_CONFIG_HASH } from '../../lib/svelte/unocss-profile'
import { bundleSvelteArtifact } from './bundler'
import { compileSvelteSource } from './compiler'
import { createDependencyFetchLifecycle } from './dependency-lifecycle'
import { globalStyleEscapeDiagnostics } from './global-style-diagnostic'
import { resolveHttpsModuleGraph } from './resolver'
import { svelteHttpsModuleSpecifiers, svelteResolverPolicyDiagnostics } from './resolver-policy'
import { generateUnoCss, unoCssGenerationDiagnostic } from './unocss'

const PROBE_REMOTE_MODULE_URL = 'https://modules.koala.invalid/probe.js'
const PROBE_SOURCE = `<script>
  import { writable } from 'svelte/store'
  import { fade } from 'svelte/transition'

  const message = writable('Koala')
  const later = import('${PROBE_REMOTE_MODULE_URL}')
</script>

{#if $message}
  <h1 class="text-red-500" transition:fade>{$message}</h1>
{/if}
{#await later then value}<p>{value.probe}</p>{/await}`
const dependencyFetches = createDependencyFetchLifecycle()

async function compileWorkerRequest(request: SvelteWorkerRequest) {
  const dependencySignal = dependencyFetches.begin(request.requestId)
  if (dependencySignal.aborted)
    return
  const result = await compileSvelteSource(request.source)
  if (dependencySignal.aborted)
    return
  const policyDiagnostics = result.ok
    ? await svelteResolverPolicyDiagnostics(request.source)
    : []
  const globalStyleDiagnostics = result.ok
    ? await globalStyleEscapeDiagnostics(request.source)
    : []
  if (dependencySignal.aborted)
    return
  const policyFailure = policyDiagnostics.length > 0
    ? {
        ok: false as const,
        error: policyDiagnostics[0],
        warnings: [...result.warnings, ...policyDiagnostics.slice(1), ...globalStyleDiagnostics],
      }
    : null
  const finalResult = policyFailure ?? result
  const warnings = finalResult.ok
    ? [...finalResult.warnings, ...globalStyleDiagnostics]
    : finalResult.warnings
  if (request.type === 'diagnose') {
    globalThis.postMessage({
      type: 'diagnose-result',
      requestId: request.requestId,
      diagnostics: finalResult.ok ? warnings : [finalResult.error, ...warnings],
    })
    return
  }
  if (finalResult.ok) {
    const dependencies = await resolveHttpsModuleGraph(
      await svelteHttpsModuleSpecifiers(request.source),
      { signal: dependencySignal },
    )
    if (dependencySignal.aborted)
      return
    if (!dependencies.ok) {
      globalThis.postMessage({
        type: 'build-error',
        requestId: request.requestId,
        error: dependencies.error,
        warnings,
      })
      return
    }
    const bundled = await bundleSvelteArtifact({
      javascript: finalResult.javascript,
      modules: dependencies.value.modules,
    })
    if (dependencySignal.aborted)
      return
    if (!bundled.ok) {
      globalThis.postMessage({
        type: 'build-error',
        requestId: request.requestId,
        error: {
          code: 'svelte_bundle_error',
          end: 0,
          message: bundled.message,
          severity: 'error',
          start: 0,
        },
        warnings,
      })
      return
    }
    let css: string
    try {
      css = await generateUnoCss(request.source, finalResult.css)
    }
    catch (error) {
      globalThis.postMessage({
        type: 'build-error',
        requestId: request.requestId,
        error: unoCssGenerationDiagnostic(error),
        warnings,
      })
      return
    }
    globalThis.postMessage({
      type: 'build-success',
      requestId: request.requestId,
      javascript: bundled.value.javascript,
      css,
      warnings,
      dependencies: dependencies.value.manifest,
    })
    return
  }
  globalThis.postMessage({
    type: 'build-error',
    requestId: request.requestId,
    error: finalResult.error,
    warnings,
  })
}

function isSvelteWorkerRequest(message: { type?: string } | SvelteWorkerRequest): message is SvelteWorkerRequest {
  return (message.type === 'diagnose' || message.type === 'build')
    && 'requestId' in message
    && 'source' in message
}

async function runToolchainProbe(): Promise<SvelteToolchainProbe> {
  const [unocssCore, unocssPreset, svelteCompiler] = await Promise.all([
    import('@unocss/core'),
    import('@unocss/preset-uno'),
    import('svelte/compiler'),
  ])
  const { createGenerator } = unocssCore
  const { default: presetUno } = unocssPreset
  const { compile, VERSION: SVELTE_VERSION } = svelteCompiler
  const compiled = compile(PROBE_SOURCE, {
    css: 'external',
    dev: false,
    filename: 'App.svelte',
    generate: 'client',
  })
  const bundled = await bundleSvelteArtifact({
    javascript: compiled.js.code,
    modules: new Map([[PROBE_REMOTE_MODULE_URL, 'export const probe = \'remote\'']]),
  })

  const uno = await createGenerator({ presets: [presetUno()] })
  const generated = await uno.generate(PROBE_SOURCE, { preflights: false })

  return {
    compilerVersion: SVELTE_VERSION,
    runtimeVersion: SVELTE_RUNTIME_REGISTRY.version,
    rollupVersion: SVELTE_TOOLCHAIN_VERSIONS.rollup,
    svelteLanguageVersion: SVELTE_TOOLCHAIN_VERSIONS.svelteLanguage,
    unocssVersion: SVELTE_TOOLCHAIN_VERSIONS.unocss,
    unocssConfigHash: UNOCSS_CONFIG_HASH,
    compiled: compiled.js.code.length > 0,
    bundled: bundled.ok && bundled.value.javascript.includes('Koala'),
    generatedCss: generated.matched.has('text-red-500'),
    runtimeImports: bundled.ok ? bundled.value.runtimeImports : [],
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
