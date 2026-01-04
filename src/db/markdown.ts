import type { PostOrPage, PresetSource } from '.'
import type { Markdown } from './types'
import { and, desc, eq, like } from 'drizzle-orm'
import { kebabCase } from 'es-toolkit'
import { format } from 'date-fns'
import { connectDB, MarkdownSource } from '.'
import { markdown } from './schema'

export async function generateMemoSubject(env: Env) {
  const now = new Date()
  const base = format(now, 'yyyyMMddHHmm')
  
  // Find all subjects starting with base for Memos
  const pattern = `${base}%`
  const existing = await connectDB(env).query.markdown.findMany({
    columns: { subject: true },
    where: and(
        eq(markdown.source, MarkdownSource.Memo),
        like(markdown.subject, pattern)
    )
  })

  const existingSubjects = new Set(existing.map(e => e.subject))
  
  if (!existingSubjects.has(base)) {
    return base
  }

  let i = 1
  while (true) {
    const suffix = i.toString().padStart(2, '0')
    const candidate = `${base}${suffix}`
    if (!existingSubjects.has(candidate)) {
      return candidate
    }
    i++
  }
}

export function linkGenerator(source: PostOrPage, subject: string) {
  let link = kebabCase(subject.replace(/[^a-z0-9\s]/gi, ''))
  if (link && source === MarkdownSource.Post) {
    link = `post/${link}`
  }
  if (link && source === MarkdownSource.Memo) {
    link = `memo/${link}`
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
  tags?: string,
) {
  return connectDB(env).insert(markdown).values({
    link: link || linkGenerator(source, subject),
    source,
    subject,
    content,
    outgoing_links,
    private: privated,
    tags,
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

export function batchAdd(
  env: Env,
  posts: Array<{
    source: PostOrPage
    subject: string
    content: string
    link?: string
    createdAt?: Date
    updatedAt?: Date
    outgoing_links?: string
    private?: boolean
    tags?: string
  }>,
) {
  const values = posts.map(post => ({
    link: post.link || linkGenerator(post.source, post.subject),
    source: post.source,
    subject: post.subject,
    content: post.content,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
    outgoing_links: post.outgoing_links,
    private: post.private || false,
    tags: post.tags,
  }))

  return connectDB(env).insert(markdown).values(values).returning()
}

export function update(
  env: Env,
  id: number,
  link: string,
  subject: string,
  content: string,
  outgoing_links?: string,
  privated: boolean = false,
  tags?: string,
) {
  return connectDB(env).update(markdown).set({
    link,
    subject,
    content,
    updatedAt: new Date(),
    outgoing_links,
    private: privated,
    tags,
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

export function readAll(env: Env, source: PostOrPage, deleted: boolean, pagination: { limit?: number, offset?: number } = {}) {
  return connectDB(env).query.markdown.findMany({
    where: and(
      eq(markdown.source, source),
      eq(markdown.deleted, deleted),
    ),
    limit: pagination.limit,
    offset: pagination.offset,
    orderBy: desc(markdown.createdAt),
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

/**
 * Extract tags and links from markdown content
 */
export function collectTagsAndLinks(markdown: { content: string, tags?: string | null, incoming_links?: string, outgoing_links?: string }) {
  const content = markdown.content

  // Extract tags (#tagname format)
  const tagMatches = content.match(/#([\w-]+)/g) || []
  const tags = [...new Set(tagMatches.map(match => match.slice(1)))] // Remove # and deduplicate

  // Extract links ([[linkname]] format)
  const linkMatches = content.match(/\[\[([^\]]+)\]\]/g) || []
  const links = [...new Set(linkMatches.map(match => match.slice(2, -2)))] // Remove [[ ]] and deduplicate

  return { tags, links }
}
