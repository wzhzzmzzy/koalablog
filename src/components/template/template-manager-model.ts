import type { CreationTemplateV1, CreationTemplateV2, RendererMode, TemplateError } from '@/lib/files/types'
import { parseAbsolutePathPrefix } from '@/lib/files/path'
import { instantiateTemplateV2, selectTemplateByPrefix } from '@/lib/files/template'

export type TemplateCatalogPreview =
  | { status: 'invalid_target_prefix', message: string }
  | { status: 'no_template', targetPrefix: string }
  | { status: 'invalid_template', templateId: string, errors: TemplateError[] }
  | {
    status: 'ready'
    templateId: string
    targetPrefix: string
    title: string
    path: string
    renderer: RendererMode
    content: string
  }

export function normalizedTemplatePrefix(input: string) {
  const parsed = parseAbsolutePathPrefix(input)
  return parsed.ok ? parsed.value : null
}

export function duplicateTemplatePrefixes(templates: CreationTemplateV1[]) {
  const counts = new Map<string, number>()
  for (const template of templates) {
    const prefix = normalizedTemplatePrefix(template.prefix)
    if (prefix)
      counts.set(prefix, (counts.get(prefix) ?? 0) + 1)
  }
  return new Set(Array.from(counts).filter(([, count]) => count > 1).map(([prefix]) => prefix))
}

export function duplicateTemplateIds(templates: CreationTemplateV1[]) {
  const counts = new Map<string, number>()
  for (const template of templates) {
    const id = template.id
    if (id)
      counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  return new Set(Array.from(counts).filter(([, count]) => count > 1).map(([id]) => id))
}

export function previewTemplateCatalog(
  templates: CreationTemplateV2[],
  sampleTargetPrefix: string,
  now: Date,
): TemplateCatalogPreview {
  const targetPrefix = parseAbsolutePathPrefix(sampleTargetPrefix)
  if (!targetPrefix.ok) {
    return {
      status: 'invalid_target_prefix',
      message: `Invalid sample target Prefix: ${targetPrefix.error.code}`,
    }
  }

  const template = selectTemplateByPrefix(templates, targetPrefix.value)
  if (!template)
    return { status: 'no_template', targetPrefix: targetPrefix.value }

  const instantiated = instantiateTemplateV2(template, {
    targetPrefix: targetPrefix.value,
    now,
    uniqueSuffix: '',
  })
  if (!instantiated.ok)
    return { status: 'invalid_template', templateId: template.id, errors: instantiated.error }

  return {
    status: 'ready',
    templateId: template.id,
    targetPrefix: targetPrefix.value,
    ...instantiated.value,
  }
}
