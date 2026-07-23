import type { SvelteDiagnostic } from '../../lib/svelte/contracts'
import { SVELTE_USER_MODULE_SPECIFIERS } from '../../lib/svelte/toolchain'
import { staticAssetDiagnostics } from './assets'

interface AstNode {
  end?: unknown
  source?: unknown
  start?: unknown
  type?: unknown
  value?: unknown
}

function isAstNode(value: unknown): value is AstNode {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function position(value: unknown) {
  return typeof value === 'number' ? value : 0
}

function literalModuleSpecifier(value: unknown) {
  if (!isAstNode(value) || value.type !== 'Literal' || typeof value.value !== 'string')
    return null
  return { end: position(value.end), start: position(value.start), value: value.value }
}

function moduleDiagnostic(specifier: string, start: number, end: number): SvelteDiagnostic | null {
  if ((SVELTE_USER_MODULE_SPECIFIERS as readonly string[]).includes(specifier))
    return null
  try {
    if (specifier.toLowerCase().startsWith('https://') && new URL(specifier).protocol === 'https:')
      return null
  }
  catch {
    // The diagnostic below categorizes non-URL module specifiers.
  }
  const code = specifier.startsWith('svelte/')
    ? 'svelte_internal_import'
    : specifier.startsWith('.') || specifier.startsWith('/')
      ? 'relative_module_import'
      : 'unsupported_module_import'
  return {
    code,
    end,
    message: `Unsupported user module specifier: ${specifier}`,
    severity: 'error',
    start,
  }
}

function isAbsoluteHttpsModule(specifier: string) {
  if (!specifier.toLowerCase().startsWith('https://'))
    return false
  try {
    return new URL(specifier).protocol === 'https:'
  }
  catch {
    return false
  }
}

function moduleSpecifier(value: unknown) {
  const specifier = literalModuleSpecifier(value)
  return specifier?.value ?? null
}

export async function svelteResolverPolicyDiagnostics(source: string) {
  const { parse } = await import('svelte/compiler')
  const ast = parse(source)
  const diagnostics = staticAssetDiagnostics(ast, source)
  const seen = new WeakSet<object>()

  function visit(value: unknown) {
    if (Array.isArray(value)) {
      for (const child of value)
        visit(child)
      return
    }
    if (!isAstNode(value) || seen.has(value))
      return
    seen.add(value)

    if (value.type === 'ImportDeclaration' || value.type === 'ExportAllDeclaration' || value.type === 'ExportNamedDeclaration') {
      const specifier = literalModuleSpecifier(value.source)
      if (specifier) {
        const error = moduleDiagnostic(specifier.value, specifier.start, specifier.end)
        if (error)
          diagnostics.push(error)
      }
    }
    if (value.type === 'ImportExpression') {
      const specifier = literalModuleSpecifier(value.source)
      if (!specifier) {
        diagnostics.push({
          code: 'non_literal_dynamic_import',
          end: position(value.end),
          message: 'Dynamic import() must use a string literal module specifier',
          severity: 'error',
          start: position(value.start),
        })
      }
      else {
        const error = moduleDiagnostic(specifier.value, specifier.start, specifier.end)
        if (error)
          diagnostics.push(error)
      }
    }
    for (const child of Object.values(value))
      visit(child)
  }

  visit(ast)
  return diagnostics.sort((left, right) => left.start - right.start || left.end - right.end)
}

export async function svelteHttpsModuleSpecifiers(source: string) {
  const { parse } = await import('svelte/compiler')
  const ast = parse(source)
  const urls = new Set<string>()
  const seen = new WeakSet<object>()

  function visit(value: unknown) {
    if (Array.isArray(value)) {
      for (const child of value)
        visit(child)
      return
    }
    if (!isAstNode(value) || seen.has(value))
      return
    seen.add(value)
    if (value.type === 'ImportDeclaration' || value.type === 'ExportAllDeclaration' || value.type === 'ExportNamedDeclaration' || value.type === 'ImportExpression') {
      const specifier = moduleSpecifier(value.source)
      if (specifier && isAbsoluteHttpsModule(specifier))
        urls.add(specifier)
    }
    for (const child of Object.values(value))
      visit(child)
  }

  visit(ast)
  return [...urls].sort()
}
