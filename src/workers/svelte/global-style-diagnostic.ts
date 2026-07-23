import type { SvelteDiagnostic } from '../../lib/svelte/contracts'

interface AstNode {
  args?: unknown
  children?: unknown
  end?: unknown
  name?: unknown
  prelude?: unknown
  start?: unknown
  type?: unknown
}

const artifactRootAttribute = 'data-koala-artifact-root'

function isAstNode(value: unknown): value is AstNode {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function position(value: unknown) {
  return typeof value === 'number' ? value : 0
}

function isGlobalSelector(value: unknown): value is AstNode {
  return isAstNode(value) && value.type === 'PseudoClassSelector' && value.name === 'global'
}

function hasArtifactRootAnchor(selector: AstNode, source: string) {
  const globals = Array.isArray(selector.children)
    ? selector.children.filter(isGlobalSelector)
    : []
  return globals.some(global => source.slice(position(global.start), position(global.end)).includes(artifactRootAttribute))
}

function hasComponentLocalAnchor(selector: AstNode) {
  if (!Array.isArray(selector.children))
    return false
  return selector.children.some((child) => {
    if (!isAstNode(child) || isGlobalSelector(child))
      return false
    return ['AttributeSelector', 'ClassSelector', 'IdSelector', 'TypeSelector'].includes(String(child.type))
  })
}

function selectorDiagnostics(rule: AstNode, source: string) {
  if (!isAstNode(rule.prelude) || rule.prelude.type !== 'SelectorList' || !Array.isArray(rule.prelude.children))
    return []
  return rule.prelude.children.flatMap((selector) => {
    if (!isAstNode(selector) || selector.type !== 'Selector' || !Array.isArray(selector.children))
      return []
    const hasExplicitGlobal = selector.children.some(isGlobalSelector)
    if (!hasExplicitGlobal || hasComponentLocalAnchor(selector) || hasArtifactRootAnchor(selector, source))
      return []
    return [{
      code: 'global_style_escape',
      end: position(selector.end),
      message: 'Unanchored :global(...) style selector can affect the Page Shell',
      severity: 'warning' as const,
      start: position(selector.start),
    }]
  })
}

export async function globalStyleEscapeDiagnostics(source: string): Promise<SvelteDiagnostic[]> {
  const { parse } = await import('svelte/compiler')
  const ast = parse(source)
  const stylesheet = (ast as { css?: unknown }).css
  if (!isAstNode(stylesheet))
    return []
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
    if (value.type === 'Rule')
      diagnostics.push(...selectorDiagnostics(value, source))
    for (const child of Object.values(value))
      visit(child)
  }

  visit(stylesheet)
  return diagnostics.sort((left, right) => left.start - right.start || left.end - right.end)
}
