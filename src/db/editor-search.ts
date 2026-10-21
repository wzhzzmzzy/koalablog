import { and, asc, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm'
import { connectDB } from '@/db'
import { markdown } from './schema'

export const EDITOR_SEARCH_PAGE_SIZE = 50

/** SQL narrows the candidate set; the client retains exact Tag/frontmatter rules. */
export async function searchEditorFiles(env: Env, userId: number, input: string, offset = 0) {
  const query = input.trim().toLowerCase()
  if (!query)
    return { files: [], nextOffset: null }
  const pathMatch = sql`instr(lower(${markdown.path}), ${query}) > 0`
  const tagMatch = sql`instr(lower(coalesce(${markdown.tags}, '')), ${query}) > 0`
  const files = await connectDB(env).select().from(markdown).where(and(
    eq(markdown.userId, userId),
    isNull(markdown.deletedAt),
    or(pathMatch, tagMatch, sql`instr(lower(${markdown.content}), ${query}) > 0`),
  )).orderBy(
    sql`case when ${pathMatch} then 0 when ${tagMatch} then 1 else 2 end`,
    desc(markdown.updatedAt),
    asc(markdown.path),
    asc(markdown.id),
  ).limit(EDITOR_SEARCH_PAGE_SIZE + 1).offset(offset)
  return {
    files: files.slice(0, EDITOR_SEARCH_PAGE_SIZE),
    nextOffset: files.length > EDITOR_SEARCH_PAGE_SIZE ? offset + EDITOR_SEARCH_PAGE_SIZE : null,
  }
}

/** Resolve browser-local recency/dirty IDs only when the Finder is opened. */
export function readEditorFilesById(env: Env, userId: number, ids: number[]) {
  if (!ids.length)
    return Promise.resolve([])
  return connectDB(env).select().from(markdown).where(and(
    eq(markdown.userId, userId),
    isNull(markdown.deletedAt),
    inArray(markdown.id, ids),
  ))
}
