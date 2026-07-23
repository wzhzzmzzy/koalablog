import type { Plugin } from '@rollup/browser'
import { SVELTE_RUNTIME_REGISTRY } from '../../lib/svelte/runtime-registry.generated'

const APP_INPUT_ID = 'koala-svelte-app'
const APP_MODULE_ID = '\0koala-svelte-app'
const ENTRY_INPUT_ID = 'koala-svelte-entry'
const ENTRY_MODULE_ID = '\0koala-svelte-entry'
const ENV_MODULE_ID = '\0koala-svelte-env'
const ARTIFACT_GLOBAL_NAME = 'KoalaArtifact'

export interface SvelteBundleInput {
  javascript: string
  modules: ReadonlyMap<string, string>
}

export interface SvelteBundleOutput {
  javascript: string
  runtimeImports: string[]
}

export type SvelteBundleResult =
  | { ok: true, value: SvelteBundleOutput }
  | { ok: false, message: string }

function runtimeModuleId(source: string, importer: string | undefined) {
  if (source === 'esm-env')
    return ENV_MODULE_ID
  if (source in SVELTE_RUNTIME_REGISTRY.entrypoints)
    return SVELTE_RUNTIME_REGISTRY.entrypoints[source as keyof typeof SVELTE_RUNTIME_REGISTRY.entrypoints]
  if (source in SVELTE_RUNTIME_REGISTRY.modules)
    return source
  if (!importer || !(importer in SVELTE_RUNTIME_REGISTRY.modules) || !source.startsWith('.'))
    return null
  const resolved = new URL(source, `https://koala-svelte-runtime.invalid/${importer}`).pathname.slice(1)
  return resolved in SVELTE_RUNTIME_REGISTRY.modules ? resolved : null
}

function remoteModuleId(source: string, importer: string | undefined, modules: ReadonlyMap<string, string>) {
  if (modules.has(source))
    return source
  if (!importer || !modules.has(importer) || !source.startsWith('.'))
    return null
  const resolved = new URL(source, importer).href
  return modules.has(resolved) ? resolved : null
}

function artifactEntrySource() {
  return `import App from '${APP_INPUT_ID}';
import { flushSync, mount as mountSvelte, tick, unmount as unmountSvelte } from 'svelte';

export function mount(target, props = {}) {
  return mountSvelte(App, { target, props });
}

export function unmount(instance, options) {
  return unmountSvelte(instance, options);
}

export { flushSync, tick };
`
}

export function createSvelteBundlePlugin(input: SvelteBundleInput, runtimeImports: Set<string>): Plugin {
  return {
    name: 'koala-svelte-virtual-modules',
    resolveId(source, importer) {
      if (source === ENTRY_INPUT_ID)
        return ENTRY_MODULE_ID
      if (source === APP_INPUT_ID)
        return APP_MODULE_ID
      const runtime = runtimeModuleId(source, importer)
      if (runtime) {
        if (source.startsWith('svelte/'))
          runtimeImports.add(source)
        return runtime
      }
      return remoteModuleId(source, importer, input.modules)
    },
    load(id) {
      if (id === ENTRY_MODULE_ID)
        return artifactEntrySource()
      if (id === APP_MODULE_ID)
        return input.javascript
      if (id === ENV_MODULE_ID)
        return 'export const BROWSER = true; export const DEV = false;'
      if (id in SVELTE_RUNTIME_REGISTRY.modules)
        return SVELTE_RUNTIME_REGISTRY.modules[id as keyof typeof SVELTE_RUNTIME_REGISTRY.modules]
      return input.modules.get(id) ?? null
    },
  }
}

function toIifeExpression(code: string) {
  const prefix = `var ${ARTIFACT_GLOBAL_NAME} = `
  if (!code.startsWith(prefix))
    throw new Error('Rollup did not emit the expected named IIFE')
  return code.slice(prefix.length).trim()
}

export async function bundleSvelteArtifact(input: SvelteBundleInput): Promise<SvelteBundleResult> {
  const runtimeImports = new Set<string>()
  try {
    const { rollup } = await import('@rollup/browser')
    const bundle = await rollup({
      input: ENTRY_INPUT_ID,
      onwarn(warning, warn) {
        if (warning.code !== 'CIRCULAR_DEPENDENCY')
          warn(warning)
      },
      plugins: [createSvelteBundlePlugin(input, runtimeImports)],
    })
    try {
      const output = await bundle.generate({
        exports: 'named',
        format: 'iife',
        inlineDynamicImports: true,
        name: ARTIFACT_GLOBAL_NAME,
      })
      const chunks = output.output.filter(item => item.type === 'chunk')
      if (chunks.length !== 1 || output.output.length !== 1)
        throw new Error('Svelte Artifact must produce exactly one JavaScript chunk')
      const [chunk] = chunks
      if (chunk.imports.length > 0 || chunk.dynamicImports.length > 0)
        throw new Error('Svelte Artifact contains unresolved imports')
      return {
        ok: true,
        value: {
          javascript: toIifeExpression(chunk.code),
          runtimeImports: [...runtimeImports].sort(),
        },
      }
    }
    finally {
      await bundle.close()
    }
  }
  catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Svelte bundling failed',
    }
  }
}
