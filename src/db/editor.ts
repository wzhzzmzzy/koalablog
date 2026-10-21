import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core'
import type { FileRecord } from './types'
import type { AbsolutePathPrefix } from '@/lib/files/types'
import { and, asc, count, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm'
import { connectDB } from '@/db'
import { parseAbsoluteFilePath, parseAbsolutePathPrefix } from '@/lib/files/path'
import { markdown } from './schema'
import { readTemplateCatalog } from './template-catalog'

// Use the shared async query interface instead of a union of adapter overloads.
export type EditorDatabase = BaseSQLiteDatabase<'async', unknown, typeof import('./schema')>

export interface EditorPrefixListing {
  prefix: AbsolutePathPrefix
  prefixes: AbsolutePathPrefix[]
  files: FileRecord[]
}

export interface EditorFileCounts {
  active: number
  trash: number
}

/** Derive the next segment in D1, so descendant records never enter the Worker. */
export async function readEditorPrefix(env: Env, input: string, userId: number): Promise<EditorPrefixListing> {
  const parsed = parseAbsolutePathPrefix(input)
  if (!parsed.ok)
    throw new Error(`Invalid editor Prefix: ${parsed.error.code}`)
  const prefix = parsed.value
  const database: EditorDatabase = connectDB(env)
  const relativePath = sql<string>`substr(${markdown.path}, length(${prefix}) + 1)`
  const separator = sql<number>`instr(${relativePath}, '/')`
  const withinPrefix = and(
    eq(markdown.userId, userId),
    isNull(markdown.deletedAt),
    sql`instr(${markdown.path}, ${prefix}) = 1`,
    sql`length(${relativePath}) > 0`,
  )
  const [files, children, catalog] = await Promise.all([
    database.select().from(markdown).where(and(withinPrefix, sql`${separator} = 0`)).orderBy(desc(markdown.createdAt), asc(markdown.id)),
    database.selectDistinct({ prefix: sql<AbsolutePathPrefix>`${prefix} || substr(${relativePath}, 1, ${separator})` })
      .from(markdown)
      .where(and(withinPrefix, sql`${separator} > 0`)),
    readTemplateCatalog(env),
  ])

  const prefixes = new Set(children.map(child => child.prefix))
  if (catalog.status === 'ready') {
    for (const template of catalog.catalog.templates) {
      if (!template.prefix.startsWith(prefix) || template.prefix === prefix)
        continue
      const segment = template.prefix.slice(prefix.length).split('/')[0]
      if (segment)
        prefixes.add(`${prefix}${segment}/` as AbsolutePathPrefix)
    }
  }
  return { prefix, prefixes: [...prefixes].sort(), files }
}

export async function readEditorCounts(env: Env, userId: number): Promise<EditorFileCounts> {
  const database: EditorDatabase = connectDB(env)
  const [result] = await database.select({
    total: count(),
    active: sql<number>`coalesce(sum(case when ${markdown.deletedAt} is null then 1 else 0 end), 0)`,
  }).from(markdown).where(eq(markdown.userId, userId))
  return { active: result.active, trash: result.total - result.active }
}

/** An explicit File URL may address one unloaded File, including a recycled ID. */
export async function readEditorFile(env: Env, target: { id: number } | { path: string }, userId: number) {
  if ('id' in target) {
    if (!Number.isSafeInteger(target.id) || target.id <= 0)
      return null
    return await connectDB(env).query.markdown.findFirst({
      where: and(eq(markdown.id, target.id), eq(markdown.userId, userId)),
    }) ?? null
  }
  const parsed = parseAbsoluteFilePath(target.path)
  if (!parsed.ok)
    return null
  return await connectDB(env).query.markdown.findFirst({
    where: and(eq(markdown.path, parsed.value), eq(markdown.userId, userId), isNull(markdown.deletedAt)),
  }) ?? null
}

export function readEditorTrash(env: Env, userId: number) {
  return connectDB(env).query.markdown.findMany({
    where: and(eq(markdown.userId, userId), isNotNull(markdown.deletedAt)),
    orderBy: [desc(markdown.deletedAt), desc(markdown.id)],
  })
}
