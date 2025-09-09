import type { PostOrPage, PresetSource } from '.'
import type { Markdown } from './types'
import { and, desc, eq, like } from 'drizzle-orm'
import { kebabCase } from 'es-toolkit'
import { connectDB, MarkdownSource } from '.'
import { markdown } from './schema'

export function linkGenerator(source: PostOrPage, subject: string) {
  let link = kebabCase(subject.replace(/[^a-z0-9\s]/gi, ''))
  if (link && source === MarkdownSource.Post) {
    link = `post/${link}`
  }
  return link
}

export function add(
  env: Env,
  source: PostOrPage,
  subject: string,
  content: string,
  link?: string,
  outgoing_links?: string,
  privated: boolean = false,
) {
  return connectDB(env).insert(markdown).values({
    link: link || linkGenerator(source, subject),
    source,
    subject,
    content,
    outgoing_links,
    private: privated,
  }).returning()
}
export function addPreset(
  env: Env,
  link: string,
  source: PresetSource,
  subject: string,
  content: string,
) {
  return connectDB(env).insert(markdown).values({
    link,
    source,
    subject,
    content,
  }).returning()
}
export function update(
  env: Env,
  id: number,
  link: string,
  subject: string,
  content: string,
  outgoing_links?: string,
  privated: boolean = false,
) {
  return connectDB(env).update(markdown).set({
    link,
    subject,
    content,
    updatedAt: new Date(),
    outgoing_links,
    private: privated,
  }).where(eq(markdown.id, id)).returning()
}

export function updateRefs(
  env: Env,
  refs: {
    id: number
    outgoing_links?: string
  }[],
) {
  const db = connectDB(env)
  return Promise.all(refs.map(({ id, outgoing_links }) => db.update(markdown).set({
    outgoing_links,
  }).where(eq(markdown.id, id))))
}

export function remove(env: Env, id: number, currentLink: string) {
  // 添加 /deleted/ 前缀到当前link
  const deletedLink = currentLink.startsWith('/deleted/')
    ? currentLink
    : `/deleted${currentLink.startsWith('/') ? '' : '/'}${currentLink}`

  return connectDB(env).update(markdown).set({
    deleted: true,
    link: deletedLink,
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
  return connectDB(env).query.markdown.findMany({
    where: and(...ops),
    orderBy: desc(markdown.createdAt),
    ...paginationQuery,
  })
}

export function read(env: Env, source: PostOrPage, link: string) {
  return connectDB(env).query.markdown.findFirst({
    where: and(
      eq(markdown.source, source),
      eq(markdown.link, link),
      eq(markdown.deleted, false),
    ),
  })
}

export function readById(env: Env, source: PostOrPage, id: number) {
  return connectDB(env).query.markdown.findFirst({
    where: and(
      eq(markdown.source, source),
      eq(markdown.id, id),
      eq(markdown.deleted, false),
    ),
  })
}

export function readAll(env: Env, source: PostOrPage, deleted: boolean) {
  return connectDB(env).query.markdown.findMany({
    where: and(
      eq(markdown.source, source),
      eq(markdown.deleted, deleted),
    ),
  })
}

export function readPreset(env: Env, source: PresetSource): Promise<Markdown | undefined> {
  return connectDB(env).query.markdown.findFirst({
    where: and(
      eq(markdown.source, source),
      eq(markdown.deleted, false),
    ),
  })
}

export function justReadAll(env: Env) {
  return connectDB(env).query.markdown.findMany()
}
