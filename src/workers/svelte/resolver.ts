import type { SvelteDependencyManifestEntry, SvelteDiagnostic } from '../../lib/svelte/contracts'
import { init, parse } from 'es-module-lexer'
import { SVELTE_DEPENDENCY_LIMITS, SVELTE_USER_MODULE_SPECIFIERS } from '../../lib/svelte/toolchain'
import { canonicalDependencyManifest, dependencyManifestEntry } from './dependency-manifest'

const javascriptMimeTypes = new Set([
  'application/ecmascript',
  'application/javascript',
  'text/ecmascript',
  'text/javascript',
])

export interface SvelteDependencyFetchResponse {
  headers: { get: (name: string) => string | null }
  ok: boolean
  redirected: boolean
  status: number
  text: () => Promise<string>
  type?: string
  url?: string
}

export interface SvelteDependencyResolverOptions {
  clearTimeout?: (timeout: ReturnType<typeof setTimeout>) => void
  fetch?: (url: string, init: RequestInit) => Promise<SvelteDependencyFetchResponse>
  now?: () => number
  setTimeout?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>
  signal?: AbortSignal
}

export interface SvelteDependencyResolution {
  manifest: SvelteDependencyManifestEntry[]
  modules: Map<string, string>
}

export type SvelteDependencyResolutionResult =
  | { ok: true, value: SvelteDependencyResolution }
  | { ok: false, error: SvelteDiagnostic }

interface PendingModule {
  depth: number
  url: string
}

function resolverDiagnostic(code: string, message: string): SvelteDiagnostic {
  return { code, end: 0, message, severity: 'error', start: 0 }
}

function isAbsoluteHttps(url: string) {
  if (!url.toLowerCase().startsWith('https://'))
    return false
  try {
    return new URL(url).protocol === 'https:'
  }
  catch {
    return false
  }
}

function normalizedMimeType(response: SvelteDependencyFetchResponse) {
  return response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() ?? ''
}

function isPublicSvelteModule(specifier: string) {
  return (SVELTE_USER_MODULE_SPECIFIERS as readonly string[]).includes(specifier)
}

function resolveImportedUrl(specifier: string, importerUrl: string) {
  if (isPublicSvelteModule(specifier))
    return null
  if (isAbsoluteHttps(specifier))
    return specifier
  if (!specifier.startsWith('.') && !specifier.startsWith('/'))
    return undefined
  try {
    const resolved = new URL(specifier, importerUrl).href
    return isAbsoluteHttps(resolved) ? resolved : undefined
  }
  catch {
    return undefined
  }
}

async function importedModuleSpecifiers(source: string): Promise<string[] | SvelteDiagnostic> {
  try {
    await init
    const [imports] = parse(source)
    const specifiers: string[] = []
    for (const item of imports) {
      if (item.n === undefined) {
        return resolverDiagnostic(
          'non_literal_dependency_import',
          'Fetched JavaScript modules may use only literal import() specifiers',
        )
      }
      specifiers.push(item.n)
    }
    return specifiers
  }
  catch (error) {
    return resolverDiagnostic(
      'invalid_javascript_module',
      error instanceof Error ? error.message : 'Fetched dependency is not valid JavaScript',
    )
  }
}

function isDiagnostic(value: string[] | SvelteDiagnostic): value is SvelteDiagnostic {
  return !Array.isArray(value)
}

export async function resolveHttpsModuleGraph(
  entryUrls: string[],
  options: SvelteDependencyResolverOptions = {},
): Promise<SvelteDependencyResolutionResult> {
  const fetcher = options.fetch ?? globalThis.fetch.bind(globalThis)
  const now = options.now ?? Date.now
  const createTimeout = options.setTimeout ?? setTimeout
  const clear = options.clearTimeout ?? clearTimeout
  const startedAt = now()
  const queue: PendingModule[] = []
  const queued = new Set<string>()
  const modules = new Map<string, string>()
  const manifest: SvelteDependencyManifestEntry[] = []
  let totalBytes = 0

  function enqueue(url: string, depth: number): SvelteDiagnostic | null {
    if (!isAbsoluteHttps(url))
      return resolverDiagnostic('invalid_dependency_url', `Dependency URL must be absolute HTTPS: ${url}`)
    if (depth > SVELTE_DEPENDENCY_LIMITS.maxDepth) {
      return resolverDiagnostic(
        'dependency_depth_limit',
        `Dependency graph exceeds ${SVELTE_DEPENDENCY_LIMITS.maxDepth} edges from the user entry`,
      )
    }
    if (!modules.has(url) && !queued.has(url)) {
      if (modules.size + queued.size >= SVELTE_DEPENDENCY_LIMITS.maxModules) {
        return resolverDiagnostic(
          'dependency_module_limit',
          `Dependency graph exceeds ${SVELTE_DEPENDENCY_LIMITS.maxModules} fetched modules`,
        )
      }
      queued.add(url)
      queue.push({ depth, url })
    }
    return null
  }

  for (const entryUrl of entryUrls) {
    const error = enqueue(entryUrl, 1)
    if (error)
      return { ok: false, error }
  }

  while (queue.length > 0) {
    const remainingResolutionMs = SVELTE_DEPENDENCY_LIMITS.resolutionTimeoutMs - (now() - startedAt)
    if (remainingResolutionMs <= 0) {
      return {
        ok: false,
        error: resolverDiagnostic('dependency_resolution_timeout', 'Dependency resolution exceeded 20000ms'),
      }
    }
    const pending = queue.shift()!
    queued.delete(pending.url)
    if (modules.has(pending.url))
      continue

    const controller = new AbortController()
    const abortFromParent = () => controller.abort()
    options.signal?.addEventListener('abort', abortFromParent, { once: true })
    if (options.signal?.aborted)
      controller.abort()
    const timeoutMs = Math.min(SVELTE_DEPENDENCY_LIMITS.fetchTimeoutMs, remainingResolutionMs)
    const timeoutIsResolutionLimit = timeoutMs < SVELTE_DEPENDENCY_LIMITS.fetchTimeoutMs
    const timeout = createTimeout(() => controller.abort(), timeoutMs)
    let source: string
    try {
      const response = await fetcher(pending.url, { redirect: 'error', signal: controller.signal })
      if (response.redirected) {
        return {
          ok: false,
          error: resolverDiagnostic('dependency_redirect', `Redirected dependency URLs are not allowed: ${pending.url}`),
        }
      }
      if (response.type === 'opaque') {
        return {
          ok: false,
          error: resolverDiagnostic('dependency_cors', `Dependency response is not CORS-visible: ${pending.url}`),
        }
      }
      if (!response.ok) {
        return {
          ok: false,
          error: resolverDiagnostic('dependency_http_status', `Dependency request failed with HTTP ${response.status}: ${pending.url}`),
        }
      }
      if (!javascriptMimeTypes.has(normalizedMimeType(response))) {
        return {
          ok: false,
          error: resolverDiagnostic('dependency_mime', `Dependency is not JavaScript: ${pending.url}`),
        }
      }
      source = await response.text()
      if (controller.signal.aborted)
        throw new Error('aborted')
    }
    catch (error) {
      const code = controller.signal.aborted
        ? timeoutIsResolutionLimit ? 'dependency_resolution_timeout' : 'dependency_fetch_timeout'
        : 'dependency_fetch_failed'
      const message = code === 'dependency_resolution_timeout'
        ? 'Dependency resolution exceeded 20000ms'
        : code === 'dependency_fetch_timeout'
          ? `Dependency fetch exceeded 10000ms: ${pending.url}`
          : error instanceof Error ? error.message : `Dependency fetch failed: ${pending.url}`
      return { ok: false, error: resolverDiagnostic(code, message) }
    }
    finally {
      clear(timeout)
      options.signal?.removeEventListener('abort', abortFromParent)
    }
    const entry = await dependencyManifestEntry(pending.url, source)
    if (entry.bytes > SVELTE_DEPENDENCY_LIMITS.maxModuleBytes) {
      return {
        ok: false,
        error: resolverDiagnostic('dependency_module_bytes', `Dependency exceeds 512000 UTF-8 bytes: ${pending.url}`),
      }
    }
    if (totalBytes + entry.bytes > SVELTE_DEPENDENCY_LIMITS.maxTotalBytes) {
      return {
        ok: false,
        error: resolverDiagnostic('dependency_total_bytes', 'Dependency source exceeds 4000000 UTF-8 bytes'),
      }
    }
    totalBytes += entry.bytes
    modules.set(pending.url, source)
    manifest.push(entry)

    const specifiers = await importedModuleSpecifiers(source)
    if (isDiagnostic(specifiers))
      return { ok: false, error: specifiers }
    for (const specifier of specifiers) {
      const resolved = resolveImportedUrl(specifier, pending.url)
      if (resolved === null)
        continue
      if (!resolved) {
        return {
          ok: false,
          error: resolverDiagnostic('unsupported_dependency_import', `Unsupported dependency import: ${specifier}`),
        }
      }
      const error = enqueue(resolved, pending.depth + 1)
      if (error)
        return { ok: false, error }
    }
  }

  return {
    ok: true,
    value: {
      manifest: canonicalDependencyManifest(manifest),
      modules,
    },
  }
}
