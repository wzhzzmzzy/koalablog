import type { EditorDatabase } from './editor'
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm'
import { connectDB } from '@/db'
import { markdown } from './schema'

/** Completion is explicitly requested; return bounded metadata, never Source. */
export function readEditorReferences(env: Env, userId: number, query: string) {
  const database: EditorDatabase = connectDB(env)
  const normalized = query.toLowerCase()
  const escaped = [...normalized].map(character => character.replace(/[\\%_]/g, '\\$&')).join('%')
  const titleQuery = normalized.startsWith('/') ? normalized.slice(1) : normalized
  return database.select({
    id: markdown.id,
    path: markdown.path,
    title: markdown.title,
    updatedAt: markdown.updatedAt,
  }).from(markdown).where(and(
    eq(markdown.userId, userId),
    isNull(markdown.deletedAt),
    sql`lower(${markdown.path}) like ${`%${escaped}%`} escape char(92)`,
  )).orderBy(
    sql`case when lower(${markdown.title}) = ${titleQuery} then 0 when instr(lower(${markdown.title}), ${titleQuery}) = 1 then 1 else 2 end`,
    desc(markdown.updatedAt),
    asc(markdown.path),
  ).limit(100)
}

export function readEditorTags(env: Env, userId: number, query: string) {
  const database: EditorDatabase = connectDB(env)
  // Support both persisted JSON tag arrays and the legacy comma-separated form.
  const tags = sql`case when json_valid(${markdown.tags}) then
    case when json_type(${markdown.tags}) = 'array'
      and not exists(select 1 from json_each(${markdown.tags}) where type != 'text')
      then ${markdown.tags} else '[]' end
    when substr(trim(${markdown.tags}), 1, 1) in ('[', '{', '"') then '[]'
    else '[' || replace(json_quote(coalesce(${markdown.tags}, '')), ',', '","') || ']' end`
  const tag = sql<string>`trim(tag.value)`
  return database.select({
    tag,
    fileCount: sql<number>`count(distinct ${markdown.id})`.mapWith(Number),
    updatedAt: sql<Date>`max(${markdown.updatedAt})`.mapWith(markdown.updatedAt),
  }).from(markdown).innerJoin(sql`json_each(${tags}) as tag`, sql`tag.type = 'text'`).where(and(
    eq(markdown.userId, userId),
    isNull(markdown.deletedAt),
    eq(markdown.renderer, 'markdown'),
    sql`length(${tag}) > 0`,
    sql`${tag} not glob ${'*[ \t\n\r\f\v#]*'}`,
    sql`instr(lower(${tag}), ${query.toLowerCase()}) > 0`,
  )).groupBy(tag).orderBy(
    sql`case when instr(lower(${tag}), ${query.toLowerCase()}) = 1 then 0 else 1 end`,
    sql`count(distinct ${markdown.id}) desc`,
    sql`max(${markdown.updatedAt}) desc`,
    asc(tag),
  ).limit(100)
}
