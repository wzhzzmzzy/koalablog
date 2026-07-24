import type { CreationTemplateV1, CreationTemplateV2, TemplateCatalogV1, TemplateCatalogV2 } from '@/lib/files/types'
import { connectDB } from '@/db'
import { DEFAULT_MEMO_TEMPLATE_V2, upgradeTemplateCatalogV1, validateTemplateV1, validateTemplateV2 } from '@/lib/files/template'
import { and, eq } from 'drizzle-orm'
import { creationTemplateCatalog } from './schema'

export const CREATION_TEMPLATE_CATALOG_KEY = 'koala:creation-templates'
const CATALOG_SCHEMA_V1 = 1 as const
const CATALOG_SCHEMA_V2 = 2 as const

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
  | { status: 'ready', catalog: TemplateCatalogV1 | TemplateCatalogV2 }

export type TemplateCatalogUpgradeResult =
  | { status: 'absent' }
  | { status: 'already_current', catalog: TemplateCatalogV2 }
  | { status: 'upgraded', catalog: TemplateCatalogV2 }
  | { status: 'conflict', currentRevision: number }

export interface StoredCatalogRow {
  schemaVersion: number
  revision: number
  payload: string
}

export interface TemplateCatalogUpgradeStore {
  readTemplateCatalogRow: () => Promise<StoredCatalogRow | null>
  compareAndSetTemplateCatalog: (input: {
    baseRevision: number
    payload: string
  }) => Promise<boolean>
}

function validatedTemplates<T extends CreationTemplateV1>(
  input: unknown,
  validate: (candidate: unknown) => { ok: true, value: T } | { ok: false, error: { field: string, message: string }[] },
): T[] {
  if (!Array.isArray(input))
    throw new TemplateCatalogStorageError('invalid_storage', 'Template Catalog payload must be an array')

  const templates = input.map((candidate) => {
    const result = validate(candidate)
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

function parseStoredTemplates<T extends CreationTemplateV1>(
  payload: string,
  validate: (candidate: unknown) => { ok: true, value: T } | { ok: false, error: { field: string, message: string }[] },
): T[] {
  try {
    return validatedTemplates(JSON.parse(payload), validate)
  }
  catch (error) {
    if (error instanceof TemplateCatalogStorageError)
      throw error
    throw new TemplateCatalogStorageError('invalid_storage', 'Template Catalog payload is malformed JSON')
  }
}

export function parseStoredTemplateCatalogRow(row: StoredCatalogRow): TemplateCatalogV1 | TemplateCatalogV2 {
  if (row.schemaVersion === CATALOG_SCHEMA_V1) {
    return {
      schemaVersion: CATALOG_SCHEMA_V1,
      revision: row.revision,
      templates: parseStoredTemplates(row.payload, validateTemplateV1),
    }
  }
  if (row.schemaVersion === CATALOG_SCHEMA_V2) {
    return {
      schemaVersion: CATALOG_SCHEMA_V2,
      revision: row.revision,
      templates: parseStoredTemplates(row.payload, validateTemplateV2),
    }
  }

  throw new TemplateCatalogStorageError(
    'invalid_storage',
    `Unsupported Template Catalog schema: ${row.schemaVersion}`,
  )
}

function createTemplateCatalogUpgradeStore(env?: Env): TemplateCatalogUpgradeStore {
  const database = connectDB(env)
  return {
    readTemplateCatalogRow: async () => {
      const [row] = await database
        .select()
        .from(creationTemplateCatalog)
        .where(eq(creationTemplateCatalog.key, CREATION_TEMPLATE_CATALOG_KEY))
        .limit(1)
      return row ?? null
    },
    compareAndSetTemplateCatalog: async (input) => {
      const [saved] = await database
        .update(creationTemplateCatalog)
        .set({
          schemaVersion: CATALOG_SCHEMA_V2,
          revision: input.baseRevision + 1,
          payload: input.payload,
          updatedAt: new Date(),
        })
        .where(and(
          eq(creationTemplateCatalog.key, CREATION_TEMPLATE_CATALOG_KEY),
          eq(creationTemplateCatalog.schemaVersion, CATALOG_SCHEMA_V1),
          eq(creationTemplateCatalog.revision, input.baseRevision),
        ))
        .returning()
      return Boolean(saved)
    },
  }
}

export async function readTemplateCatalog(env?: Env): Promise<TemplateCatalogReadResult> {
  const row = await createTemplateCatalogUpgradeStore(env).readTemplateCatalogRow()

  if (!row)
    return { status: 'absent' }

  return {
    status: 'ready',
    catalog: parseStoredTemplateCatalogRow(row),
  }
}

export async function ensureTemplateCatalogInitialized(env?: Env): Promise<TemplateCatalogV1 | TemplateCatalogV2> {
  const [row] = await connectDB(env)
    .insert(creationTemplateCatalog)
    .values({
      key: CREATION_TEMPLATE_CATALOG_KEY,
      schemaVersion: CATALOG_SCHEMA_V2,
      revision: 1,
      payload: JSON.stringify([DEFAULT_MEMO_TEMPLATE_V2]),
    })
    .onConflictDoUpdate({
      target: creationTemplateCatalog.key,
      set: { key: CREATION_TEMPLATE_CATALOG_KEY },
    })
    .returning()

  if (!row)
    throw new TemplateCatalogStorageError('invalid_storage', 'Template Catalog initialization did not persist')
  return parseStoredTemplateCatalogRow(row)
}

export async function upgradeTemplateCatalogFromStore(
  store: TemplateCatalogUpgradeStore,
  expectedRevision?: number,
): Promise<TemplateCatalogUpgradeResult> {
  const row = await store.readTemplateCatalogRow()
  if (!row)
    return { status: 'absent' }

  const catalog = parseStoredTemplateCatalogRow(row)
  if (catalog.schemaVersion === CATALOG_SCHEMA_V2)
    return { status: 'already_current', catalog }
  if (expectedRevision !== undefined && catalog.revision !== expectedRevision)
    return { status: 'conflict', currentRevision: catalog.revision }

  const upgraded = upgradeTemplateCatalogV1(catalog)
  const saved = await store.compareAndSetTemplateCatalog({
    baseRevision: catalog.revision,
    payload: JSON.stringify(upgraded.templates),
  })
  if (saved) {
    return {
      status: 'upgraded',
      catalog: { ...upgraded, revision: catalog.revision + 1 },
    }
  }

  const latestRow = await store.readTemplateCatalogRow()
  if (!latestRow)
    return { status: 'absent' }
  const latest = parseStoredTemplateCatalogRow(latestRow)
  return latest.schemaVersion === CATALOG_SCHEMA_V2
    ? { status: 'already_current', catalog: latest }
    : { status: 'conflict', currentRevision: latest.revision }
}

export async function upgradeStoredTemplateCatalog(
  env: Env | undefined,
  baseRevision: number,
): Promise<TemplateCatalogUpgradeResult> {
  return upgradeTemplateCatalogFromStore(createTemplateCatalogUpgradeStore(env), baseRevision)
}

export async function replaceTemplateCatalog(
  env: Env | undefined,
  baseRevision: number,
  input: CreationTemplateV2[],
): Promise<
  | { status: 'saved', catalog: TemplateCatalogV2 }
  | { status: 'conflict', currentRevision: number }
  > {
  const templates = validatedTemplates(input, validateTemplateV2)
  const revision = baseRevision + 1
  const [saved] = await connectDB(env)
    .update(creationTemplateCatalog)
    .set({
      schemaVersion: CATALOG_SCHEMA_V2,
      revision,
      payload: JSON.stringify(templates),
      updatedAt: new Date(),
    })
    .where(and(
      eq(creationTemplateCatalog.key, CREATION_TEMPLATE_CATALOG_KEY),
      eq(creationTemplateCatalog.revision, baseRevision),
    ))
    .returning()

  if (saved) {
    return {
      status: 'saved',
      catalog: {
        schemaVersion: CATALOG_SCHEMA_V2,
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
