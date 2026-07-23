import type { UnocssPluginContext } from '@unocss/core'
import type { SvelteDiagnostic } from '../../lib/svelte/contracts'
import {
  UNOCSS_ARTIFACT_SCOPE,
  UNOCSS_CONFIG_PROFILE,
} from '../../lib/svelte/unocss-profile'

export {
  UNOCSS_ARTIFACT_SCOPE,
  UNOCSS_CONFIG_HASH,
  UNOCSS_CONFIG_PROFILE,
  UNOCSS_CONFIG_SERIALIZATION,
} from '../../lib/svelte/unocss-profile'

interface AstNode {
  attributes?: unknown
  children?: unknown
  data?: unknown
  end?: unknown
  name?: unknown
  start?: unknown
  type?: unknown
  value?: unknown
}

function isAstNode(value: unknown): value is AstNode {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function staticClassTokens(value: unknown) {
  if (!Array.isArray(value))
    return []
  return value.flatMap((segment) => {
    if (!isAstNode(segment) || segment.type !== 'Text' || typeof segment.data !== 'string')
      return []
    return segment.data.split(/\s+/).filter(Boolean)
  })
}

export async function extractUnoCssTokens(source: string) {
  const { parse } = await import('svelte/compiler')
  const ast = parse(source)
  const tokens = new Set<string>()
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

    if (value.type === 'Attribute' && value.name === 'class') {
      for (const token of staticClassTokens(value.value))
        tokens.add(token)
    }
    if (value.type === 'Class' && typeof value.name === 'string')
      tokens.add(value.name)
    for (const child of Object.values(value))
      visit(child)
  }

  visit((ast as { html?: unknown }).html)
  return [...tokens].sort()
}

async function createUnoGenerator() {
  const [{ createGenerator }, { default: presetUno }] = await Promise.all([
    import('@unocss/core'),
    import('@unocss/preset-uno'),
  ])
  return createGenerator<object>({
    presets: [presetUno(UNOCSS_CONFIG_PROFILE.presetUno)],
    shortcuts: UNOCSS_CONFIG_PROFILE.shortcuts,
    theme: UNOCSS_CONFIG_PROFILE.theme,
  })
}

async function transformComponentDirectives(css: string) {
  if (!css)
    return css
  const [{ default: transformerDirectives }, { default: MagicString }, generator] = await Promise.all([
    import('@unocss/transformer-directives'),
    import('magic-string'),
    createUnoGenerator(),
  ])
  const source = new MagicString(css)
  await transformerDirectives().transform?.(source, '/App.svelte.css', { uno: generator } as UnocssPluginContext)
  return source.toString()
}

export async function generateUnoCss(source: string, componentCss: string) {
  const [generator, tokens, transformedComponentCss] = await Promise.all([
    createUnoGenerator(),
    extractUnoCssTokens(source),
    transformComponentDirectives(componentCss),
  ])
  const generated = await generator.generate(tokens, {
    preflights: true,
    safelist: false,
    scope: UNOCSS_ARTIFACT_SCOPE,
  })
  return [generated.css, transformedComponentCss].filter(Boolean).join('\n')
}

export function unoCssGenerationDiagnostic(error: unknown): SvelteDiagnostic {
  return {
    code: 'unocss_generation_error',
    end: 0,
    message: error instanceof Error ? error.message : 'UnoCSS generation failed',
    severity: 'error',
    start: 0,
  }
}
