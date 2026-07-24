import { SVELTE_DEPENDENCY_LIMITS } from '@/lib/svelte/toolchain'
import { resolveHttpsModuleGraph, type SvelteDependencyFetchResponse } from '@/workers/svelte/resolver'
import { describe, expect, it } from 'vitest'

interface FakeResponseOptions {
  contentType?: string
  ok?: boolean
  redirected?: boolean
  status?: number
  type?: string
}

function response(source: string, options: FakeResponseOptions = {}): SvelteDependencyFetchResponse {
  return {
    headers: { get: name => name.toLowerCase() === 'content-type' ? options.contentType ?? 'text/javascript; charset=utf-8' : null },
    ok: options.ok ?? true,
    redirected: options.redirected ?? false,
    status: options.status ?? 200,
    text: async () => source,
    type: options.type,
  }
}

function fetchFrom(modules: Record<string, string | SvelteDependencyFetchResponse>) {
  return async (url: string) => {
    const module = modules[url]
    if (!module)
      return response('', { ok: false, status: 404 })
    return typeof module === 'string' ? response(module) : module
  }
}

function linearModules(length: number, sourceBytes = 128) {
  const modules: Record<string, string> = {}
  const urls = Array.from({ length }, (_, index) => `https://modules.example.test/${index}.js`)
  for (const [index, url] of urls.entries()) {
    const next = urls[index + 1]
    const importStatement = next ? `import '${next}'` : ''
    modules[url] = `${importStatement}/*${'x'.repeat(sourceBytes - importStatement.length - 4)}*/`
  }
  return { modules, urls }
}

describe('bounded HTTPS dependency resolver', () => {
  it('uses the exact dependency limits', () => {
    expect(SVELTE_DEPENDENCY_LIMITS).toEqual({
      maxDepth: 8,
      maxModules: 64,
      maxModuleBytes: 512_000,
      maxTotalBytes: 4_000_000,
      fetchTimeoutMs: 10_000,
      resolutionTimeoutMs: 20_000,
    })
  })

  it('resolves static and literal dynamic HTTPS imports, cycles, and a canonical manifest', async () => {
    const root = 'https://modules.example.test/root.js'
    const child = 'https://modules.example.test/child.js'
    const later = 'https://modules.example.test/later.js'
    const result = await resolveHttpsModuleGraph([root], {
      fetch: fetchFrom({
        [root]: 'import \'./child.js\'; import(\'./later.js\')',
        [child]: 'import \'./root.js\'; export const child = true',
        [later]: 'export const later = true',
      }),
    })

    expect(result).toMatchObject({ ok: true })
    if (!result.ok)
      return
    expect([...result.value.modules.keys()].sort()).toEqual([child, later, root])
    expect(result.value.manifest.map(entry => entry.url)).toEqual([child, later, root])
    expect(result.value.manifest).toContainEqual({
      url: later,
      bytes: 25,
      sha256: '6c09ca221f4656a44fb5ec3b29dc311e7924995d7f4d122c3a03e73f42e9f49f',
    })
  })

  it.each([
    ['opaque CORS response', response('export {}', { type: 'opaque' }), 'dependency_cors'],
    ['redirected response', response('export {}', { redirected: true }), 'dependency_redirect'],
    ['non-JavaScript MIME', response('export {}', { contentType: 'application/json' }), 'dependency_mime'],
  ])('rejects %s', async (_label, module, code) => {
    const result = await resolveHttpsModuleGraph(['https://modules.example.test/root.js'], {
      fetch: fetchFrom({ 'https://modules.example.test/root.js': module }),
    })

    expect(result).toMatchObject({ ok: false, error: { code } })
  })

  it('rejects non-literal and unsupported imports in fetched modules', async () => {
    const url = 'https://modules.example.test/root.js'
    const dynamic = await resolveHttpsModuleGraph([url], { fetch: fetchFrom({ [url]: 'import(moduleName)' }) })
    const bare = await resolveHttpsModuleGraph([url], { fetch: fetchFrom({ [url]: 'import \'lodash\'' }) })

    expect(dynamic).toMatchObject({ ok: false, error: { code: 'non_literal_dependency_import' } })
    expect(bare).toMatchObject({ ok: false, error: { code: 'unsupported_dependency_import' } })
  })

  it('accepts all boundary values and rejects the next depth and module', async () => {
    const depthBoundary = linearModules(8)
    const depthOverflow = linearModules(9)
    const moduleBoundary = linearModules(64)
    const moduleOverflow = linearModules(65)

    await expect(resolveHttpsModuleGraph([depthBoundary.urls[0]], { fetch: fetchFrom(depthBoundary.modules) })).resolves.toMatchObject({ ok: true })
    await expect(resolveHttpsModuleGraph([depthOverflow.urls[0]], { fetch: fetchFrom(depthOverflow.modules) })).resolves.toMatchObject({
      ok: false,
      error: { code: 'dependency_depth_limit' },
    })
    await expect(resolveHttpsModuleGraph(moduleBoundary.urls, { fetch: fetchFrom(moduleBoundary.modules) })).resolves.toMatchObject({ ok: true })
    await expect(resolveHttpsModuleGraph(moduleOverflow.urls, { fetch: fetchFrom(moduleOverflow.modules) })).resolves.toMatchObject({
      ok: false,
      error: { code: 'dependency_module_limit' },
    })
  })

  it('enforces per-module and total UTF-8 byte boundaries', async () => {
    const single = 'https://modules.example.test/single.js'
    const exactModule = `/*${'x'.repeat(SVELTE_DEPENDENCY_LIMITS.maxModuleBytes - 4)}*/`
    const overflowModule = `${exactModule}x`
    const exactTotal = linearModules(64, 62_500)
    const overflowTotal = linearModules(64, 62_501)

    await expect(resolveHttpsModuleGraph([single], { fetch: fetchFrom({ [single]: exactModule }) })).resolves.toMatchObject({ ok: true })
    await expect(resolveHttpsModuleGraph([single], { fetch: fetchFrom({ [single]: overflowModule }) })).resolves.toMatchObject({
      ok: false,
      error: { code: 'dependency_module_bytes' },
    })
    await expect(resolveHttpsModuleGraph(exactTotal.urls, { fetch: fetchFrom(exactTotal.modules) })).resolves.toMatchObject({ ok: true })
    await expect(resolveHttpsModuleGraph(overflowTotal.urls, { fetch: fetchFrom(overflowTotal.modules) })).resolves.toMatchObject({
      ok: false,
      error: { code: 'dependency_total_bytes' },
    })
  })

  it('reports request and overall timeouts deterministically', async () => {
    const url = 'https://modules.example.test/root.js'
    const requestTimeout = await resolveHttpsModuleGraph([url], {
      clearTimeout: () => {},
      fetch: async (_url, init) => {
        if (init.signal?.aborted)
          throw new Error('aborted')
        return response('export {}')
      },
      setTimeout: (callback) => {
        callback()
        return 0 as unknown as ReturnType<typeof setTimeout>
      },
    })
    const elapsed = [0, 20_001]
    const overallTimeout = await resolveHttpsModuleGraph([url], {
      fetch: fetchFrom({ [url]: 'export {}' }),
      now: () => elapsed.shift() ?? 20_001,
    })
    const elapsedDuringFetch = [0, 19_999]
    const overallTimeoutDuringFetch = await resolveHttpsModuleGraph([url], {
      clearTimeout: () => {},
      fetch: async (_url, init) => {
        if (init.signal?.aborted)
          throw new Error('aborted')
        return response('export {}')
      },
      now: () => elapsedDuringFetch.shift() ?? 20_001,
      setTimeout: (callback) => {
        callback()
        return 0 as unknown as ReturnType<typeof setTimeout>
      },
    })

    expect(requestTimeout).toMatchObject({ ok: false, error: { code: 'dependency_fetch_timeout' } })
    expect(overallTimeout).toMatchObject({ ok: false, error: { code: 'dependency_resolution_timeout' } })
    expect(overallTimeoutDuringFetch).toMatchObject({ ok: false, error: { code: 'dependency_resolution_timeout' } })
  })
})
