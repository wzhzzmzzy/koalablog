import type {
  CreationTemplateV1,
  InstantiatedTemplateV1,
  Result,
  TemplateContext,
  TemplateError,
  TemplateField,
} from './types'
import { format } from 'date-fns'
import { containsControlCharacter, deriveTitle, isDescendantOfPrefix, parseAbsoluteFilePath, parseAbsolutePathPrefix } from './path'

const PLACEHOLDER = /\{\{([^{}]+)\}\}/g

export const DEFAULT_MEMO_TEMPLATE_V1: CreationTemplateV1 = {
  id: 'memo-default',
  prefix: '/memo/',
  titlePattern: '{{datetime:yyyyMMddHHmm}}{{uniqueSuffix}}',
  pathPattern: '{{targetPrefix}}/{{title}}',
  content: '',
}

function templateError(code: TemplateError['code'], field: TemplateField, message: string): TemplateError {
  return { code, field, message }
}

function placeholders(pattern: string): string[] {
  return Array.from(pattern.matchAll(PLACEHOLDER), match => match[1])
}

function validatePlaceholders(pattern: string, field: TemplateField, allowed: Set<string>): TemplateError[] {
  const errors: TemplateError[] = []
  for (const placeholder of placeholders(pattern)) {
    if (placeholder.startsWith('datetime:')) {
      if (placeholder.slice('datetime:'.length).length === 0) {
        errors.push(templateError('invalid_datetime_placeholder', field, 'Datetime placeholder requires a format'))
      }
      continue
    }
    if (!allowed.has(placeholder))
      errors.push(templateError('unknown_placeholder', field, `Unknown placeholder: ${placeholder}`))
  }
  return errors
}

export function validateTemplateV1(input: unknown): Result<CreationTemplateV1, TemplateError[]> {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: [templateError('invalid_template', 'template', 'Template must be an object')] }
  }

  const value = input as Record<string, unknown>
  const errors: TemplateError[] = []
  const requiredFields = ['id', 'prefix', 'titlePattern', 'pathPattern', 'content'] as const
  if (requiredFields.some(field => typeof value[field] !== 'string')) {
    return { ok: false, error: [templateError('invalid_template', 'template', 'Template fields must be strings')] }
  }

  const template = value as unknown as CreationTemplateV1
  if (!template.id.trim())
    errors.push(templateError('invalid_id', 'id', 'Template ID cannot be empty'))

  const prefix = parseAbsolutePathPrefix(template.prefix)
  if (!prefix.ok)
    errors.push(templateError('invalid_prefix', 'prefix', 'Template Prefix must be absolute'))

  if (!template.titlePattern || template.titlePattern.includes('/'))
    errors.push(templateError('invalid_title', 'titlePattern', 'Title pattern must be a non-empty path segment'))
  errors.push(...validatePlaceholders(template.titlePattern, 'titlePattern', new Set(['uniqueSuffix'])))

  errors.push(...validatePlaceholders(template.pathPattern, 'pathPattern', new Set(['targetPrefix', 'title'])))
  if (!template.pathPattern.startsWith('{{targetPrefix}}'))
    errors.push(templateError('path_must_use_target_prefix', 'pathPattern', 'Path pattern must begin with targetPrefix'))
  if (!/(?:^|\/)\{\{title\}\}$/.test(template.pathPattern))
    errors.push(templateError('path_must_end_with_title', 'pathPattern', 'Path pattern must end with the complete Title segment'))

  errors.push(...validatePlaceholders(template.content, 'content', new Set(['targetPrefix', 'title', 'path', 'uniqueSuffix'])))

  if (errors.length > 0)
    return { ok: false, error: errors }

  return {
    ok: true,
    value: { ...template, prefix: prefix.ok ? prefix.value : template.prefix },
  }
}

function renderPattern(pattern: string, values: Record<string, string>, now: Date): Result<string, TemplateError[]> {
  try {
    return {
      ok: true,
      value: pattern.replace(PLACEHOLDER, (_, placeholder: string) => {
        if (placeholder.startsWith('datetime:'))
          return format(now, placeholder.slice('datetime:'.length))
        return values[placeholder] ?? ''
      }),
    }
  }
  catch (error) {
    return {
      ok: false,
      error: [templateError('invalid_datetime_placeholder', 'titlePattern', error instanceof Error ? error.message : 'Invalid datetime format')],
    }
  }
}

export function selectTemplateV1(
  templates: CreationTemplateV1[],
  targetPrefix: TemplateContext['targetPrefix'],
): CreationTemplateV1 | null {
  return templates
    .flatMap((template) => {
      const prefix = parseAbsolutePathPrefix(template.prefix)
      return prefix.ok && targetPrefix.startsWith(prefix.value) ? [{ template, prefix: prefix.value }] : []
    })
    .sort((left, right) => right.prefix.length - left.prefix.length)[0]
    ?.template ?? null
}

export function instantiateTemplateV1(
  input: CreationTemplateV1,
  context: TemplateContext,
): Result<InstantiatedTemplateV1, TemplateError[]> {
  const validated = validateTemplateV1(input)
  if (!validated.ok)
    return validated

  const titleResult = renderPattern(validated.value.titlePattern, {
    uniqueSuffix: context.uniqueSuffix,
  }, context.now)
  if (!titleResult.ok)
    return titleResult

  const title = titleResult.value
  if (!title || title.includes('/') || containsControlCharacter(title)) {
    return { ok: false, error: [templateError('invalid_title', 'titlePattern', 'Resolved Title must be one path segment')] }
  }

  const pathResult = renderPattern(validated.value.pathPattern, {
    targetPrefix: context.targetPrefix,
    title,
  }, context.now)
  if (!pathResult.ok)
    return pathResult

  const path = parseAbsoluteFilePath(pathResult.value)
  if (!path.ok) {
    return { ok: false, error: [templateError('invalid_path', 'pathPattern', `Resolved Path is invalid: ${path.error.code}`)] }
  }
  if (!isDescendantOfPrefix(path.value, context.targetPrefix)) {
    return { ok: false, error: [templateError('path_outside_target_prefix', 'pathPattern', 'Resolved Path is outside targetPrefix')] }
  }
  if (deriveTitle(path.value) !== title) {
    return { ok: false, error: [templateError('path_must_end_with_title', 'pathPattern', 'Resolved Path must end with Title')] }
  }

  const contentResult = renderPattern(validated.value.content, {
    targetPrefix: context.targetPrefix,
    uniqueSuffix: context.uniqueSuffix,
    title,
    path: path.value,
  }, context.now)
  if (!contentResult.ok)
    return contentResult

  return {
    ok: true,
    value: {
      title,
      path: path.value,
      content: contentResult.value,
    },
  }
}
