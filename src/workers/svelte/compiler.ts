import type {
  SvelteCompileResult,
  SvelteDiagnostic,
  SvelteDiagnosticSeverity,
} from '../../lib/svelte/contracts'

interface CompilerDiagnostic {
  code?: unknown
  end?: { character?: unknown }
  message?: unknown
  position?: unknown
  start?: { character?: unknown }
}

const possiblePreprocessorTagPattern = /<(script|style|template)\b[^>]*>/gi
const languageAttributePattern = /\blang\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i
const svelteHeadPattern = /<svelte:head\b[^>]*>/gi

function diagnostic(
  severity: SvelteDiagnosticSeverity,
  code: string,
  message: string,
  start: number,
  end: number,
): SvelteDiagnostic {
  return { code, end, message, severity, start }
}

function compilerDiagnostic(
  value: unknown,
  severity: SvelteDiagnosticSeverity,
): SvelteDiagnostic {
  const source = value as CompilerDiagnostic
  const position = Array.isArray(source.position) ? source.position : []
  const start = typeof position[0] === 'number'
    ? position[0]
    : typeof source.start?.character === 'number' ? source.start.character : 0
  const end = typeof position[1] === 'number'
    ? position[1]
    : typeof source.end?.character === 'number' ? source.end.character : start
  const message = typeof source.message === 'string'
    ? source.message.replace(/\nhttps:\/\/svelte\.dev\/e\/\S+$/, '')
    : 'Svelte compiler failed'
  return diagnostic(
    severity,
    typeof source.code === 'string' ? source.code : 'svelte_compiler_error',
    message,
    start,
    Math.max(start, end),
  )
}

function unsupportedSyntaxDiagnostics(source: string) {
  const diagnostics: SvelteDiagnostic[] = []
  for (const match of source.matchAll(possiblePreprocessorTagPattern)) {
    const languageMatch = languageAttributePattern.exec(match[0])
    if (!languageMatch)
      continue
    const language = languageMatch[1] ?? languageMatch[2] ?? languageMatch[3]
    const tag = match[1]?.toLowerCase()
    if (tag === 'script' && language.toLowerCase() === 'ts')
      continue
    diagnostics.push(diagnostic(
      'error',
      'unsupported_preprocessor',
      `${language} preprocessing is not supported`,
      match.index,
      match.index + match[0].length,
    ))
  }
  for (const match of source.matchAll(svelteHeadPattern)) {
    diagnostics.push(diagnostic(
      'error',
      'svelte_head_not_supported',
      '<svelte:head> is not supported',
      match.index,
      match.index + match[0].length,
    ))
  }
  return diagnostics.sort((left, right) => left.start - right.start || left.end - right.end)
}

export async function compileSvelteSource(source: string): Promise<SvelteCompileResult> {
  const unsupported = unsupportedSyntaxDiagnostics(source)
  if (unsupported.length > 0) {
    return {
      ok: false,
      error: unsupported[0],
      warnings: unsupported.slice(1),
    }
  }

  const { compile } = await import('svelte/compiler')
  try {
    const result = compile(source, {
      css: 'external',
      dev: false,
      filename: '/App.svelte',
      generate: 'client',
    })
    return {
      ok: true,
      javascript: result.js.code,
      css: result.css?.code ?? '',
      warnings: result.warnings.map(warning => compilerDiagnostic(warning, 'warning')),
    }
  }
  catch (error) {
    return {
      ok: false,
      error: compilerDiagnostic(error, 'error'),
      warnings: [],
    }
  }
}
