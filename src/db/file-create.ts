import type { AbsoluteFilePath, AbsolutePathPrefix, CreationTemplateV1, TemplateError } from '@/lib/files/types'
import { parseAbsoluteFilePath, parseAbsolutePathPrefix } from '@/lib/files/path'
import { instantiateTemplateV1, selectTemplateV1 } from '@/lib/files/template'
import { RENDERER_MODE } from '@/lib/files/types'
import { add, isActivePathConstraintError } from './markdown'
import { readTemplateCatalog } from './template-catalog'

const FILE_CREATION_ATTEMPT_LIMIT = 100

export interface CreateFileInput {
  targetPrefix: string
}

export type CreateFileResult =
  | { status: 'created', file: Awaited<ReturnType<typeof add>>[number] }
  | { status: 'path_conflict', path: AbsoluteFilePath }
  | { status: 'catalog_absent' }

export class FileCreationError extends Error {
  constructor(
    public readonly code: 'invalid_target_prefix' | 'invalid_template',
    message: string,
  ) {
    super(message)
    this.name = 'FileCreationError'
  }
}

interface CreationCandidate {
  path: AbsoluteFilePath
  content: string
}

function uniqueSuffix(attempt: number) {
  return attempt === 0 ? '' : `-${attempt}`
}

function blankCandidate(targetPrefix: AbsolutePathPrefix, attempt: number): CreationCandidate {
  const title = `unnamed${uniqueSuffix(attempt)}`
  const path = parseAbsoluteFilePath(`${targetPrefix}${title}`)
  if (!path.ok)
    throw new FileCreationError('invalid_target_prefix', `Blank Creation Path is invalid: ${path.error.code}`)
  return { path: path.value, content: '' }
}

function templateCandidate(
  template: CreationTemplateV1,
  targetPrefix: AbsolutePathPrefix,
  now: Date,
  attempt: number,
): CreationCandidate {
  const instantiated = instantiateTemplateV1(template, {
    targetPrefix,
    now,
    uniqueSuffix: uniqueSuffix(attempt),
  })
  if (!instantiated.ok) {
    const message = instantiated.error.map((error: TemplateError) => `${error.field}: ${error.message}`).join('; ')
    throw new FileCreationError('invalid_template', message)
  }
  return instantiated.value
}

function canRetryTemplate(template: CreationTemplateV1 | null) {
  return template === null || template.titlePattern.includes('{{uniqueSuffix}}')
}

export async function createFile(env: Env | undefined, input: CreateFileInput): Promise<CreateFileResult> {
  const targetPrefix = parseAbsolutePathPrefix(input.targetPrefix)
  if (!targetPrefix.ok)
    throw new FileCreationError('invalid_target_prefix', `Invalid target Prefix: ${targetPrefix.error.code}`)

  const catalog = await readTemplateCatalog(env)
  if (catalog.status === 'absent')
    return { status: 'catalog_absent' }

  const template = selectTemplateV1(catalog.catalog.templates, targetPrefix.value)
  const attemptLimit = canRetryTemplate(template) ? FILE_CREATION_ATTEMPT_LIMIT : 1
  const now = new Date()
  let lastPath: AbsoluteFilePath | null = null

  for (let attempt = 0; attempt < attemptLimit; attempt++) {
    const candidate = template
      ? templateCandidate(template, targetPrefix.value, now, attempt)
      : blankCandidate(targetPrefix.value, attempt)
    lastPath = candidate.path
    try {
      const [file] = await add(env ?? {} as Env, {
        path: candidate.path,
        renderer: RENDERER_MODE.Markdown,
        content: candidate.content,
        private: candidate.path.startsWith('/memo/'),
        remoteTruth: true,
      })
      return { status: 'created', file }
    }
    catch (error) {
      if (!isActivePathConstraintError(error))
        throw error
    }
  }

  return { status: 'path_conflict', path: lastPath! }
}
