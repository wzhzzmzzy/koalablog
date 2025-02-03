import type { PostOrPage, PresetSource } from '.'
import { and, desc, eq, like } from 'drizzle-orm'
import { kebabCase } from 'es-toolkit'
import { connectDB, MarkdownSource } from '.'
import { markdown } from './schema'

export function linkGenerator(source: PostOrPage, subject: string) {
  let link = kebabCase(subject.replace(/[^a-z0-9\s]/gi, ''))
  if (source === MarkdownSource.Post) {
    link = `post/${link}`
  }
  return link
}

interface TagAndLinkCollection { tags: string[], links: string[] }
/**
 * 读取 Markdown content，从其中提取 tag 和 双向链接
 */
export function collectTagsAndLinks(markdown: { content?: string | null }): TagAndLinkCollection {
  const tagAndLinkCollection: TagAndLinkCollection = {
    tags: [],
    links: [],
  }

  const content = markdown.content || ''
  const tagRegex = /#([\w\-]+)/g
  const linkRegex = /\[\[([\w\- ]+)\]\]/g

  let tagMatch = tagRegex.exec(content)
  while (tagMatch !== null) {
    if (!tagAndLinkCollection.tags.includes(tagMatch[1])) {
      tagAndLinkCollection.tags.push(tagMatch[1])
    }
    tagMatch = tagRegex.exec(content)
  }

  let linkMatch = linkRegex.exec(content)
  while (linkMatch !== null) {
    if (!tagAndLinkCollection.links.includes(linkMatch[1])) {
      tagAndLinkCollection.links.push(linkMatch[1])
    }
    linkMatch = linkRegex.exec(content)
  }

  return tagAndLinkCollection
}
export function add(
  env: Env,
  source: PostOrPage,
  subject: string,
  content: string,
) {
  const { tags, links } = collectTagsAndLinks({ content })
  return connectDB(env.DB).insert(markdown).values({
    link: linkGenerator(source, subject),
    source,
    subject,
    content,
    tags: tags.join(','),
    outgoing_links: links.join(','),
  }).returning()
}
export function update(
  env: Env,
  id: number,
  link: string,
  subject: string,
  content: string,
) {
  const { tags, links } = collectTagsAndLinks({ content })
  return connectDB(env.DB).update(markdown).set({
    link,
    subject,
    content,
    updatedAt: new Date(),
    tags: tags.join(','),
    outgoing_links: links.join(','),
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

// DEBUG
export function readAll(env: Env) {
  return connectDB(env.DB).query.markdown.findMany()
}

export function readPreset(env: Env, source: PresetSource) {
  return connectDB(env.DB).query.markdown.findFirst({
    where: eq(markdown.source, source),
  })
}
