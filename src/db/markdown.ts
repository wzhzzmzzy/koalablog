import type { AbsoluteFilePath } from '@/lib/files/types'
import { analyzeMarkdownSource } from '@/lib/files/analysis'
import { classifySource, deriveTitle, parseAbsoluteFilePath } from '@/lib/files/path'
import { format } from 'date-fns'
import { and, desc, eq, inArray, isNotNull, isNull, like, or, sql } from 'drizzle-orm'
import { kebabCase } from 'es-toolkit'
import { connectDB, MarkdownSource } from '.'
import { markdown } from './schema'

export interface SaveFileInput {
  id: number
  path: string
  content: string
  private: boolean
  baseRevision: number
}

export interface BatchFileInput {
  path: string
  content: string
  private?: boolean
  remoteTruth?: boolean
  createdAt?: Date
  updatedAt?: Date
  deletedAt?: Date
}

export type SaveFileResult =
  | { status: 'saved', file: typeof markdown.$inferSelect }
  | { status: 'conflict', current: typeof markdown.$inferSelect }
  | { status: 'path_conflict', path: AbsoluteFilePath }
  | { status: 'not_found' }

export class FileInputError extends Error {
  constructor(
    public readonly code: 'invalid_path',
    message: string,
  ) {
    super(message)
    this.name = 'FileInputError'
  }
}

function requiredPath(input: string): AbsoluteFilePath {
  const parsed = parseAbsoluteFilePath(input)
  if (!parsed.ok)
    throw new FileInputError('invalid_path', `Invalid File Path: ${parsed.error.code}`)
  return parsed.value
}

function sourceValues(pathInput: string, content: string) {
  const path = requiredPath(pathInput)
  const analysis = analyzeMarkdownSource(content)
  return {
    path,
    title: deriveTitle(path),
    source: classifySource(path),
    content,
    tags: analysis.tags.join(','),
    outgoing_links: JSON.stringify(analysis.outgoingPaths),
  }
}

function insertValues(input: BatchFileInput) {
  return {
    ...sourceValues(input.path, input.content),
    private: input.private ?? false,
    remoteTruth: input.remoteTruth ?? false,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    deletedAt: input.deletedAt,
  }
}

export async function generateMemoTitle(env: Env) {
  const base = format(new Date(), 'yyyyMMddHHmm')
  const existing = await connectDB(env).query.markdown.findMany({
    columns: { title: true },
    where: and(
      eq(markdown.source, MarkdownSource.Memo),
      like(markdown.path, `/memo/${base}%`),
      isNull(markdown.deletedAt),
    ),
  })
  const titles = new Set(existing.map(file => file.title))
  if (!titles.has(base))
    return base

  for (let suffix = 1; ; suffix++) {
    const candidate = `${base}${suffix.toString().padStart(2, '0')}`
    if (!titles.has(candidate))
      return candidate
  }
}

export function pathGenerator(source: MarkdownSource, title: string) {
  const slug = kebabCase(title.replace(/[^a-z0-9\s]/gi, ''))
  const leaf = slug || title.trim()
  if (source === MarkdownSource.Post)
    return `/post/${leaf}`
  if (source === MarkdownSource.Memo)
    return `/memo/${leaf}`
  if (source === MarkdownSource.Wiki)
    return `/wiki/${leaf}`
  return `/${leaf}`
}

export async function add(env: Env, input: BatchFileInput) {
  return connectDB(env).insert(markdown).values(insertValues(input)).returning()
}

export async function batchAdd(env: Env, files: BatchFileInput[]) {
  if (files.length === 0)
    return []
  return connectDB(env).insert(markdown).values(files.map(insertValues)).returning()
}

export async function batchUpsert(env: Env, files: BatchFileInput[]) {
  if (files.length === 0)
    return []
  return connectDB(env)
    .insert(markdown)
    .values(files.map(insertValues))
    .onConflictDoUpdate({
      target: markdown.path,
      targetWhere: isNull(markdown.deletedAt),
      set: {
        title: sql.raw(`excluded.${markdown.title.name}`),
        content: sql.raw(`excluded.${markdown.content.name}`),
        source: sql.raw(`excluded.${markdown.source.name}`),
        tags: sql.raw(`excluded.${markdown.tags.name}`),
        outgoing_links: sql.raw(`excluded.${markdown.outgoing_links.name}`),
        private: sql.raw(`excluded.${markdown.private.name}`),
        remoteTruth: false,
        revision: sql`${markdown.revision} + 1`,
        updatedAt: new Date(),
      },
    })
    .returning()
}

export async function saveFile(env: Env, input: SaveFileInput): Promise<SaveFileResult> {
  const values = {
    ...sourceValues(input.path, input.content),
    private: input.private,
    remoteTruth: true,
    updatedAt: new Date(),
  }
  const db = connectDB(env)

  if (input.id === 0) {
    try {
      const [file] = await db.insert(markdown).values(values).returning()
      return { status: 'saved', file }
    }
    catch (error) {
      if (isUniqueConstraintError(error))
        return { status: 'path_conflict', path: values.path }
      throw error
    }
  }

  let file: typeof markdown.$inferSelect | undefined
  try {
    const updated = await db.update(markdown).set({
      ...values,
      revision: sql`${markdown.revision} + 1`,
    }).where(and(
      eq(markdown.id, input.id),
      eq(markdown.revision, input.baseRevision),
      isNull(markdown.deletedAt),
    )).returning()
    file = updated[0]
  }
  catch (error) {
    if (isUniqueConstraintError(error))
      return { status: 'path_conflict', path: values.path }
    throw error
  }
  if (file)
    return { status: 'saved', file }

  const current = await readById(env, input.id)
  return current ? { status: 'conflict', current } : { status: 'not_found' }
}

export async function updatePrivate(
  env: Env,
  id: number,
  privated: boolean,
  baseRevision: number,
): Promise<SaveFileResult> {
  const [file] = await connectDB(env).update(markdown).set({
    private: privated,
    remoteTruth: true,
    revision: sql`${markdown.revision} + 1`,
    updatedAt: new Date(),
  }).where(and(
    eq(markdown.id, id),
    eq(markdown.revision, baseRevision),
    isNull(markdown.deletedAt),
  )).returning()
  if (file)
    return { status: 'saved', file }

  const current = await readById(env, id)
  return current ? { status: 'conflict', current } : { status: 'not_found' }
}

export async function trash(env: Env, id: number) {
  const [file] = await connectDB(env).update(markdown).set({
    deletedAt: new Date(),
    updatedAt: new Date(),
    revision: sql`${markdown.revision} + 1`,
  }).where(and(eq(markdown.id, id), isNull(markdown.deletedAt))).returning()

  return file
    ? { status: 'trashed' as const, file }
    : { status: 'not_found' as const }
}

function restoredIdentity(path: string, suffix: number) {
  const restoredPath = `${path}-restored${suffix === 1 ? '' : `-${suffix}`}`
  const parsed = requiredPath(restoredPath)
  return { path: parsed, title: deriveTitle(parsed), source: classifySource(parsed) }
}

async function nextRestoredIdentity(env: Env, path: string) {
  const db = connectDB(env)
  for (let suffix = 1; ; suffix++) {
    const candidate = restoredIdentity(path, suffix)
    const occupied = await db.query.markdown.findFirst({
      columns: { id: true },
      where: and(isNull(markdown.deletedAt), eq(markdown.path, candidate.path)),
    })
    if (!occupied)
      return candidate
  }
}

function isUniqueConstraintError(error: unknown) {
  return error instanceof Error && error.message.includes('UNIQUE constraint failed')
}

export async function restore(env: Env, id: number, renameOnConflict = false) {
  const file = await readAnyById(env, id)
  if (!file)
    return { status: 'not_found' as const }
  if (!file.deletedAt)
    return { status: 'restored' as const, file }

  const db = connectDB(env)
  const conflict = await db.query.markdown.findFirst({
    columns: { id: true },
    where: and(isNull(markdown.deletedAt), eq(markdown.path, file.path)),
  })
  if (!conflict) {
    try {
      const [restored] = await db.update(markdown).set({
        deletedAt: null,
        updatedAt: new Date(),
        revision: sql`${markdown.revision} + 1`,
      }).where(and(eq(markdown.id, id), isNotNull(markdown.deletedAt))).returning()
      if (restored)
        return { status: 'restored' as const, file: restored }
    }
    catch (error) {
      if (!isUniqueConstraintError(error))
        throw error
    }
  }

  if (!renameOnConflict) {
    const suggestion = await nextRestoredIdentity(env, file.path)
    return {
      status: 'conflict' as const,
      suggestedPath: suggestion.path,
      suggestedTitle: suggestion.title,
    }
  }

  while (true) {
    const candidate = await nextRestoredIdentity(env, file.path)
    try {
      const [restored] = await db.update(markdown).set({
        ...candidate,
        deletedAt: null,
        updatedAt: new Date(),
        revision: sql`${markdown.revision} + 1`,
      }).where(and(eq(markdown.id, id), isNotNull(markdown.deletedAt))).returning()
      return restored
        ? { status: 'restored' as const, file: restored }
        : { status: 'not_found' as const }
    }
    catch (error) {
      if (!isUniqueConstraintError(error))
        throw error
    }
  }
}

export async function purge(env: Env, id: number) {
  const [file] = await connectDB(env).delete(markdown).where(and(eq(markdown.id, id), isNotNull(markdown.deletedAt))).returning()
  return file ? { status: 'purged' as const } : { status: 'not_found' as const }
}

export async function emptyTrash(env: Env) {
  const files = await connectDB(env).delete(markdown).where(isNotNull(markdown.deletedAt)).returning()
  return { status: 'purged' as const, count: files.length }
}

export async function batchTrashByPaths(env: Env, paths: string[]) {
  if (paths.length === 0)
    return []
  const canonicalPaths = paths.map(path => requiredPath(path))
  const db = connectDB(env)
  const records = await db.query.markdown.findMany({
    columns: { id: true, path: true },
    where: and(inArray(markdown.path, canonicalPaths), isNull(markdown.deletedAt)),
  })
  if (records.length === 0)
    return canonicalPaths.map(path => ({ status: 'not_found' as const, path }))

  const trashedAt = new Date()
  const files = await db.update(markdown).set({
    deletedAt: trashedAt,
    updatedAt: trashedAt,
    revision: sql`${markdown.revision} + 1`,
  }).where(and(
    inArray(markdown.id, records.map(record => record.id)),
    isNull(markdown.deletedAt),
  )).returning()
  const byPath = new Map(files.map(file => [file.path, file]))
  const reportedPaths = new Set<string>()

  return canonicalPaths.map((path) => {
    const file = byPath.get(path)
    if (!file || reportedPaths.has(path))
      return { status: 'not_found' as const, path }
    reportedPaths.add(path)
    return { status: 'trashed' as const, path, file }
  })
}

export function readList(
  env: Env,
  source: MarkdownSource,
  tag?: string,
  options: { includePrivate?: boolean } = {},
) {
  const { includePrivate = false } = options
  const filters = [
    eq(markdown.source, source),
    isNull(markdown.deletedAt),
    tag ? like(markdown.tags, `%${tag}%`) : null,
    !includePrivate ? eq(markdown.private, false) : null,
  ].filter(filter => !!filter)
  return connectDB(env).query.markdown.findMany({
    where: and(...filters),
    orderBy: desc(markdown.createdAt),
  })
}

export function read(env: Env, source: MarkdownSource, path: string) {
  return connectDB(env).query.markdown.findFirst({
    where: and(
      eq(markdown.source, source),
      eq(markdown.path, requiredPath(path)),
      isNull(markdown.deletedAt),
    ),
  })
}

export function readById(env: Env, id: number) {
  return connectDB(env).query.markdown.findFirst({
    where: and(eq(markdown.id, id), isNull(markdown.deletedAt)),
  })
}

export function readAnyById(env: Env, id: number) {
  return connectDB(env).query.markdown.findFirst({ where: eq(markdown.id, id) })
}

export function readTrash(env: Env) {
  return connectDB(env).query.markdown.findMany({
    where: isNotNull(markdown.deletedAt),
    orderBy: [desc(markdown.deletedAt), desc(markdown.id)],
  })
}

export function readAll(env: Env, source: MarkdownSource) {
  return connectDB(env).query.markdown.findMany({
    where: and(eq(markdown.source, source), isNull(markdown.deletedAt)),
    orderBy: desc(markdown.createdAt),
  })
}

export function readRemoteTruth(env: Env) {
  return connectDB(env).query.markdown.findMany({
    columns: { id: true, path: true, title: true, content: true, revision: true },
    where: and(eq(markdown.remoteTruth, true), isNull(markdown.deletedAt)),
  })
}

export function clearRemoteTruth(env: Env, id: number) {
  return connectDB(env).update(markdown).set({ remoteTruth: false }).where(eq(markdown.id, id))
}

export function readByPrefix(env: Env, prefix: string) {
  if (!prefix)
    return justReadAll(env)
  const canonicalPrefix = prefix === '/' ? '/' : `${prefix.replace(/^\/+|\/+$/g, '')}/`
  return connectDB(env).query.markdown.findMany({
    where: like(markdown.path, `${canonicalPrefix}%`),
    orderBy: desc(markdown.createdAt),
  })
}

export function readAllPublic(env: Env) {
  return connectDB(env).query.markdown.findMany({
    where: and(
      or(eq(markdown.source, MarkdownSource.Memo), eq(markdown.source, MarkdownSource.Post)),
      isNull(markdown.deletedAt),
      eq(markdown.private, false),
    ),
    orderBy: desc(markdown.createdAt),
  })
}

export async function readActivePaths(env: Env) {
  const files = await connectDB(env).query.markdown.findMany({
    columns: { path: true },
    where: isNull(markdown.deletedAt),
  })
  return files.map(file => file.path)
}

export function justReadAll(env: Env) {
  return connectDB(env).query.markdown.findMany()
}
