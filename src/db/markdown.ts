import type { PostOrPage, PresetSource } from '.'
import { and, desc, eq, like } from 'drizzle-orm'
import { kebabCase } from 'es-toolkit'
import { connectDB, MarkdownSource } from '.'
import { markdown } from './schema'

function linkGenerator(source: PostOrPage, subject: string) {
  let link = kebabCase(subject)
  if (source === MarkdownSource.Post) {
    link = `post/${link}`
  }
  return link
}

export function add(
  env: Env,
  source: PostOrPage,
  subject: string,
  content: string,
  tags: string[] = [],
) {
  console.log('add', source, subject, content)
  return connectDB(env.DB).insert(markdown).values({
    link: linkGenerator(source, subject),
    source,
    subject,
    content,
    tags: tags.join(','),
  }).returning()
}

export function update(
  env: Env,
  id: number,
  link: string,
  subject: string,
  content: string,
  tags: string[] = [],
) {
  return connectDB(env.DB).update(markdown).set({
    link,
    subject,
    content,
    updatedAt: new Date(),
    tags: tags.join(','),
  }).where(eq(markdown.id, id))
}

export function remove(env: Env, id: number) {
  return connectDB(env.DB).update(markdown).set({
    deleted: true,
    updatedAt: new Date(),
  }).where(eq(markdown.id, id))
}

/**
 * @param env CloudFlare Env
 * @param source
 * @param tag query by tag
 * @param pagination query pagination params, default read all
 * @param pagination.pageSize read all if 0
 * @param pagination.pageNum read all if 0
 */
export function readList(env: Env, source: PostOrPage, tag?: string, pagination: { pageSize?: number, pageNum?: number } = {}) {
  const { pageSize = 0, pageNum = 0 } = pagination
  const paginationQuery: { limit?: number, offset?: number } = {}
  if (pageSize && pageNum) {
    paginationQuery.limit = pageSize
    paginationQuery.offset = (pageNum - 1) * pageSize
  }

  const ops = [
    eq(markdown.source, source),
    eq(markdown.deleted, false),
    tag ? like(markdown.tags, `%${tag}%`) : null,
  ].filter(i => !!i)
  return connectDB(env.DB).query.markdown.findMany({
    where: and(...ops),
    orderBy: desc(markdown.createdAt),
    ...paginationQuery,
  })
}

export function read(env: Env, source: PostOrPage, link: string) {
  return connectDB(env.DB).query.markdown.findFirst({
    where: and(
      eq(markdown.source, source),
      eq(markdown.link, link),
    ),
  })
}

export function readPreset(env: Env, source: PresetSource) {
  return connectDB(env.DB).query.markdown.findFirst({
    where: eq(markdown.source, source),
  })
}
