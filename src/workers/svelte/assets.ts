import type { SvelteDiagnostic } from '../../lib/svelte/contracts'

interface AstNode {
  attributes?: unknown
  end?: unknown
  name?: unknown
  start?: unknown
  type?: unknown
  value?: unknown
}

const elementAssetAttributes: Record<string, readonly string[]> = {
  audio: ['src'],
  embed: ['src'],
  img: ['src', 'srcset'],
  link: ['href'],
  object: ['data'],
  source: ['src', 'srcset'],
  track: ['src'],
  video: ['src', 'poster'],
}

function isAstNode(value: unknown): value is AstNode {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function position(value: unknown) {
  return typeof value === 'number' ? value : 0
}

function staticAttributeValue(value: unknown) {
  if (!Array.isArray(value) || value.length !== 1 || !isAstNode(value[0]) || value[0].type !== 'Text')
    return null
  const text = value[0]
  if (typeof text.value !== 'string' && typeof (text as { data?: unknown }).data !== 'string')
    return null
  const content = typeof (text as { data?: unknown }).data === 'string'
    ? (text as { data: string }).data
    : text.value as string
  return { content, end: position(text.end), start: position(text.start) }
}

function assetDiagnostic(url: string, start: number, end: number): SvelteDiagnostic | null {
  if (url.startsWith('/') && !url.startsWith('//'))
    return null
  try {
    if (url.toLowerCase().startsWith('https://') && new URL(url).protocol === 'https:')
      return null
  }
  catch {
    // The structured diagnostic below describes every unsupported URL form.
  }
  return {
    code: 'invalid_static_asset_url',
    end,
    message: `Static asset URL must be slash-leading or absolute HTTPS: ${url}`,
    severity: 'error',
    start,
  }
}

function srcsetDiagnostics(value: string, start: number) {
  const diagnostics: SvelteDiagnostic[] = []
  let offset = 0
  for (const candidate of value.split(',')) {
    const url = candidate.trim().split(/\s+/, 1)[0]
    if (url) {
      const candidateStart = start + offset + candidate.indexOf(url)
      const error = assetDiagnostic(url, candidateStart, candidateStart + url.length)
      if (error)
        diagnostics.push(error)
    }
    offset += candidate.length + 1
  }
  return diagnostics
}

function cssUrlDiagnostics(value: string, start: number) {
  const diagnostics: SvelteDiagnostic[] = []
  let cursor = 0
  while (cursor < value.length) {
    const urlStart = value.indexOf('url(', cursor)
    if (urlStart < 0)
      break
    let contentStart = urlStart + 4
    while (/\s/.test(value[contentStart] ?? ''))
      contentStart += 1
    const quote = value[contentStart]
    if (quote === '"' || quote === '\'')
      contentStart += 1
    const closing = quote === '"' || quote === '\''
      ? value.indexOf(quote, contentStart)
      : value.indexOf(')', contentStart)
    if (closing < 0)
      break
    const url = value.slice(contentStart, closing).trim()
    const urlStartInSource = start + contentStart + value.slice(contentStart, closing).indexOf(url)
    if (url) {
      const error = assetDiagnostic(url, urlStartInSource, urlStartInSource + url.length)
      if (error)
        diagnostics.push(error)
    }
    cursor = value.indexOf(')', closing) + 1
    if (cursor === 0)
      break
  }
  return diagnostics
}

export function staticAssetDiagnostics(ast: unknown, source: string) {
  const diagnostics: SvelteDiagnostic[] = []
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

    if (value.type === 'Element' && typeof value.name === 'string' && Array.isArray(value.attributes)) {
      const attributes = elementAssetAttributes[value.name]
      if (attributes) {
        for (const attribute of value.attributes) {
          if (!isAstNode(attribute) || attribute.type !== 'Attribute' || typeof attribute.name !== 'string')
            continue
          if (!attributes.includes(attribute.name))
            continue
          const literal = staticAttributeValue(attribute.value)
          if (!literal)
            continue
          if (attribute.name === 'srcset') {
            diagnostics.push(...srcsetDiagnostics(literal.content, literal.start))
          }
          else {
            const error = assetDiagnostic(literal.content, literal.start, literal.end)
            if (error)
              diagnostics.push(error)
          }
        }
      }
    }
    if (value.type === 'Attribute' && value.name === 'style') {
      const literal = staticAttributeValue(value.value)
      if (literal)
        diagnostics.push(...cssUrlDiagnostics(literal.content, literal.start))
    }
    if (value.type === 'Declaration' && typeof value.value === 'string') {
      const declarationStart = position(value.start)
      const valueStart = source.indexOf(value.value, declarationStart)
      if (valueStart >= 0)
        diagnostics.push(...cssUrlDiagnostics(value.value, valueStart))
    }
    for (const child of Object.values(value))
      visit(child)
  }

  visit(ast)
  return diagnostics.sort((left, right) => left.start - right.start || left.end - right.end)
}
