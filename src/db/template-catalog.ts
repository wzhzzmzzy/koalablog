import type { CreationTemplateV1, TemplateCatalogV1 } from '@/lib/files/types'
import { connectDB } from '@/db'
import { DEFAULT_MEMO_TEMPLATE_V1, validateTemplateV1 } from '@/lib/files/template'
import { and, eq } from 'drizzle-orm'
import { creationTemplateCatalog } from './schema'

const CATALOG_KEY = 'koala:creation-templates'
const CATALOG_SCHEMA_VERSION = 1 as const

export class TemplateCatalogStorageError extends Error {
  constructor(
    public readonly code: 'invalid_catalog' | 'invalid_storage',
    message: string,
  ) {
    super(message)
    this.name = 'TemplateCatalogStorageError'
  }
}

export type TemplateCatalogReadResult =
  | { status: 'absent' }
  | { status: 'ready', catalog: TemplateCatalogV1 }

function validatedTemplates(input: unknown): CreationTemplateV1[] {
  if (!Array.isArray(input))
    throw new TemplateCatalogStorageError('invalid_storage', 'Template Catalog payload must be an array')

  const templates = input.map((candidate) => {
    const result = validateTemplateV1(candidate)
    if (!result.ok) {
      throw new TemplateCatalogStorageError(
        'invalid_catalog',
        result.error.map(error => `${error.field}: ${error.message}`).join('; '),
      )
    }
    return result.value
  })

  const prefixes = new Set<string>()
  const ids = new Set<string>()
  for (const template of templates) {
    if (ids.has(template.id)) {
      throw new TemplateCatalogStorageError(
        'invalid_catalog',
        `Duplicate Template ID: ${template.id}`,
      )
    }
    if (prefixes.has(template.prefix)) {
      throw new TemplateCatalogStorageError(
        'invalid_catalog',
        `Duplicate Template Prefix: ${template.prefix}`,
      )
    }
    ids.add(template.id)
    prefixes.add(template.prefix)
  }

  return templates
}

function parseStoredTemplates(payload: string): CreationTemplateV1[] {
  try {
    return validatedTemplates(JSON.parse(payload))
  }
  catch (error) {
    if (error instanceof TemplateCatalogStorageError)
      throw error
    throw new TemplateCatalogStorageError('invalid_storage', 'Template Catalog payload is malformed JSON')
  }
}

export async function readTemplateCatalog(env?: Env): Promise<TemplateCatalogReadResult> {
  const [row] = await connectDB(env)
    .select()
    .from(creationTemplateCatalog)
    .where(eq(creationTemplateCatalog.key, CATALOG_KEY))
    .limit(1)

  if (!row)
    return { status: 'absent' }
  if (row.schemaVersion !== CATALOG_SCHEMA_VERSION) {
    throw new TemplateCatalogStorageError(
      'invalid_storage',
      `Unsupported Template Catalog schema: ${row.schemaVersion}`,
    )
  }

  return {
    status: 'ready',
    catalog: {
      schemaVersion: CATALOG_SCHEMA_VERSION,
      revision: row.revision,
      templates: parseStoredTemplates(row.payload),
    },
  }
}

export async function ensureTemplateCatalogInitialized(env?: Env): Promise<TemplateCatalogV1> {
  await connectDB(env)
    .insert(creationTemplateCatalog)
    .values({
      key: CATALOG_KEY,
      schemaVersion: CATALOG_SCHEMA_VERSION,
      revision: 1,
      payload: JSON.stringify([DEFAULT_MEMO_TEMPLATE_V1]),
    })
    .onConflictDoNothing()

  const stored = await readTemplateCatalog(env)
  if (stored.status === 'absent')
    throw new TemplateCatalogStorageError('invalid_storage', 'Template Catalog initialization did not persist')
  return stored.catalog
}

export async function replaceTemplateCatalog(
  env: Env | undefined,
  baseRevision: number,
  input: CreationTemplateV1[],
): Promise<
  | { status: 'saved', catalog: TemplateCatalogV1 }
  | { status: 'conflict', currentRevision: number }
  > {
  const templates = validatedTemplates(input)
  const revision = baseRevision + 1
  const [saved] = await connectDB(env)
    .update(creationTemplateCatalog)
    .set({
      revision,
      payload: JSON.stringify(templates),
      updatedAt: new Date(),
    })
    .where(and(
      eq(creationTemplateCatalog.key, CATALOG_KEY),
      eq(creationTemplateCatalog.revision, baseRevision),
    ))
    .returning()

  if (saved) {
    return {
      status: 'saved',
      catalog: {
        schemaVersion: CATALOG_SCHEMA_VERSION,
        revision: saved.revision,
        templates,
      },
    }
  }

  const current = await readTemplateCatalog(env)
  return {
    status: 'conflict',
    currentRevision: current.status === 'ready' ? current.catalog.revision : 0,
  }
}
