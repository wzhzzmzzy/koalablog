import type { SvelteWorkerRequest } from '../../lib/svelte/contracts'
import { bundleSvelteArtifact } from './bundler'
import { compileSvelteSource } from './compiler'
import { createDependencyFetchLifecycle } from './dependency-lifecycle'
import { globalStyleEscapeDiagnostics } from './global-style-diagnostic'
import { resolveHttpsModuleGraph } from './resolver'
import { svelteHttpsModuleSpecifiers, svelteResolverPolicyDiagnostics } from './resolver-policy'
import { generateUnoCss, unoCssGenerationDiagnostic } from './unocss'

const dependencyFetches = createDependencyFetchLifecycle()

async function compileWorkerRequest(request: SvelteWorkerRequest) {
  const dependencySignal = request.type === 'build'
    ? dependencyFetches.begin(request.requestId)
    : new AbortController().signal
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

globalThis.addEventListener('message', async (event: MessageEvent<{ type?: string } | SvelteWorkerRequest>) => {
  if (isSvelteWorkerRequest(event.data))
    void compileWorkerRequest(event.data)
})
