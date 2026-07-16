import { format } from 'date-fns'
import { and, desc, eq, inArray, isNotNull, isNull, like, or, sql } from 'drizzle-orm'
import { kebabCase } from 'es-toolkit'
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
      like(markdown.subject, pattern),
      isNull(markdown.deletedAt),
    ),
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

export function linkGenerator(source: MarkdownSource, subject: string) {
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
  source: MarkdownSource,
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

export function batchAdd(
  env: Env,
  posts: Array<{
    source: MarkdownSource
    subject: string
    content: string
    link?: string
    createdAt?: Date
    updatedAt?: Date
    outgoing_links?: string
    private?: boolean
    tags?: string
    deletedAt?: Date
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
    deletedAt: post.deletedAt,
  }))

  return connectDB(env).insert(markdown).values(values).returning()
}

export function batchUpsert(
  env: Env,
  posts: Array<{
    source: MarkdownSource
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

  return connectDB(env)
    .insert(markdown)
    .values(values)
    .onConflictDoUpdate({
      target: markdown.link,
      targetWhere: isNull(markdown.deletedAt),
      set: {
        subject: sql.raw(`excluded.${markdown.subject.name}`),
        content: sql.raw(`excluded.${markdown.content.name}`),
        source: sql.raw(`excluded.${markdown.source.name}`),
        tags: sql.raw(`excluded.${markdown.tags.name}`),
        outgoing_links: sql.raw(`excluded.${markdown.outgoing_links.name}`),
        private: sql.raw(`excluded.${markdown.private.name}`),
        updatedAt: new Date(),
      },
    })
    .returning()
}

export function update(
  env: Env,
  id: number,
  source: MarkdownSource,
  link: string,
  subject: string,
  content: string,
  outgoing_links?: string,
  privated: boolean = false,
  tags?: string,
) {
  return connectDB(env).update(markdown).set({
    source,
    link,
    subject,
    content,
    updatedAt: new Date(),
    outgoing_links,
    private: privated,
    tags,
  }).where(and(eq(markdown.id, id), isNull(markdown.deletedAt))).returning()
}

export function updatePrivate(
  env: Env,
  id: number,
  privated: boolean,
) {
  return connectDB(env).update(markdown).set({
    private: privated,
    updatedAt: new Date(),
  }).where(and(eq(markdown.id, id), isNull(markdown.deletedAt))).returning()
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
  }).where(and(eq(markdown.id, id), isNull(markdown.deletedAt)))))
}

export async function trash(env: Env, id: number) {
  const [document] = await connectDB(env).update(markdown).set({
    deletedAt: new Date(),
    updatedAt: new Date(),
  }).where(and(eq(markdown.id, id), isNull(markdown.deletedAt))).returning()

  return document
    ? { status: 'trashed' as const, document }
    : { status: 'not_found' as const }
}

function restoredIdentity(link: string, subject: string, suffix: number) {
  return {
    link: `${link}-restored${suffix === 1 ? '' : `-${suffix}`}`,
    subject: `${subject} (restored${suffix === 1 ? '' : ` ${suffix}`})`,
  }
}

async function nextRestoredIdentity(env: Env, link: string, subject: string) {
  const db = connectDB(env)
  for (let suffix = 1; ; suffix++) {
    const candidate = restoredIdentity(link, subject, suffix)
    const occupied = await db.query.markdown.findFirst({
      columns: { id: true },
      where: and(
        isNull(markdown.deletedAt),
        or(eq(markdown.link, candidate.link), eq(markdown.subject, candidate.subject)),
      ),
    })
    if (!occupied)
      return candidate
  }
}

function isUniqueConstraintError(error: unknown) {
  return error instanceof Error && error.message.includes('UNIQUE constraint failed')
}

export async function restore(env: Env, id: number, renameOnConflict = false) {
  const document = await readAnyById(env, id)
  if (!document)
    return { status: 'not_found' as const }
  if (!document.deletedAt)
    return { status: 'restored' as const, document }

  const db = connectDB(env)
  const conflict = await db.query.markdown.findFirst({
    columns: { id: true },
    where: and(
      isNull(markdown.deletedAt),
      or(eq(markdown.link, document.link), eq(markdown.subject, document.subject)),
    ),
  })

  if (!conflict) {
    try {
      const [restored] = await db.update(markdown).set({
        deletedAt: null,
        updatedAt: new Date(),
      }).where(and(eq(markdown.id, id), isNotNull(markdown.deletedAt))).returning()

      if (restored)
        return { status: 'restored' as const, document: restored }
    }
    catch (error) {
      if (!isUniqueConstraintError(error))
        throw error
    }
  }

  if (!renameOnConflict) {
    const suggestion = await nextRestoredIdentity(env, document.link, document.subject)
    return {
      status: 'conflict' as const,
      suggestedLink: suggestion.link,
      suggestedSubject: suggestion.subject,
    }
  }

  while (true) {
    const candidate = await nextRestoredIdentity(env, document.link, document.subject)
    try {
      const [restored] = await db.update(markdown).set({
        ...candidate,
        deletedAt: null,
        updatedAt: new Date(),
      }).where(and(eq(markdown.id, id), isNotNull(markdown.deletedAt))).returning()

      return restored
        ? { status: 'restored' as const, document: restored }
        : { status: 'not_found' as const }
    }
    catch (error) {
      if (!isUniqueConstraintError(error))
        throw error
    }
  }
}

export async function purge(env: Env, id: number) {
  const [document] = await connectDB(env).delete(markdown).where(and(eq(markdown.id, id), isNotNull(markdown.deletedAt))).returning()

  return document
    ? { status: 'purged' as const }
    : { status: 'not_found' as const }
}

export async function emptyTrash(env: Env) {
  const documents = await connectDB(env).delete(markdown).where(isNotNull(markdown.deletedAt)).returning()

  return { status: 'purged' as const, count: documents.length }
}

export async function batchTrashByLinks(env: Env, links: string[]) {
  if (links.length === 0)
    return []

  const db = connectDB(env)
  const records = await db.query.markdown.findMany({
    columns: { id: true, link: true },
    where: and(inArray(markdown.link, links), isNull(markdown.deletedAt)),
  })
  if (records.length === 0)
    return links.map(link => ({ status: 'not_found' as const, link }))

  const trashedAt = new Date()
  const documents = await db.update(markdown).set({
    deletedAt: trashedAt,
    updatedAt: trashedAt,
  }).where(inArray(markdown.id, records.map(record => record.id))).returning()
  const byLink = new Map(documents.map(document => [document.link, document]))

  return links.map(link => byLink.has(link)
    ? { status: 'trashed' as const, link, document: byLink.get(link)! }
    : { status: 'not_found' as const, link })
}

/**
 * @param env CloudFlare Env
 * @param source
 * @param tag query by tag
 * @param options.includePrivate whether to include private posts, default false
 */
export function readList(
  env: Env,
  source: MarkdownSource,
  tag?: string,
  options: {
    includePrivate?: boolean
  } = {},
) {
  const { includePrivate = false } = options

  const ops = [
    eq(markdown.source, source),
    isNull(markdown.deletedAt),
    tag ? like(markdown.tags, `%${tag}%`) : null,
    !includePrivate ? eq(markdown.private, false) : null,
  ].filter(i => !!i)
  return connectDB(env).query.markdown.findMany({
    where: and(...ops),
    orderBy: desc(markdown.createdAt),
  })
}

export function read(env: Env, source: MarkdownSource, link: string) {
  return connectDB(env).query.markdown.findFirst({
    where: and(
      eq(markdown.source, source),
      eq(markdown.link, link),
      isNull(markdown.deletedAt),
    ),
  })
}

export function readById(env: Env, id: number) {
  return connectDB(env).query.markdown.findFirst({
    where: and(
      eq(markdown.id, id),
      isNull(markdown.deletedAt),
    ),
  })
}

export function readAnyById(env: Env, id: number) {
  return connectDB(env).query.markdown.findFirst({
    where: eq(markdown.id, id),
  })
}

export function readTrash(env: Env) {
  return connectDB(env).query.markdown.findMany({
    where: isNotNull(markdown.deletedAt),
    orderBy: [desc(markdown.deletedAt), desc(markdown.id)],
  })
}

export function readAll(env: Env, source: MarkdownSource) {
  return connectDB(env).query.markdown.findMany({
    where: and(
      eq(markdown.source, source),
      isNull(markdown.deletedAt),
    ),
    orderBy: desc(markdown.createdAt),
  })
}

export function readRemoteTruth(env: Env) {
  return connectDB(env).query.markdown.findMany({
    columns: {
      id: true,
      link: true,
      subject: true,
      content: true,
    },
    where: and(
      eq(markdown.remoteTruth, true),
      isNull(markdown.deletedAt),
    ),
  })
}

export function clearRemoteTruth(env: Env, id: number) {
  return connectDB(env).update(markdown).set({
    remoteTruth: false,
  }).where(eq(markdown.id, id))
}

export function readByPrefix(env: Env, prefix: string) {
  if (!prefix) {
    return justReadAll(env)
  }

  return connectDB(env).query.markdown.findMany({
    where: like(markdown.link, `${prefix}%`),
    orderBy: desc(markdown.createdAt),
  })
}

export function readAllPublic(env: Env) {
  return connectDB(env).query.markdown.findMany({
    where: and(
      or(
        eq(markdown.source, MarkdownSource.Memo),
        eq(markdown.source, MarkdownSource.Post),
      ),
      isNull(markdown.deletedAt),
      eq(markdown.private, false),
    ),
    orderBy: desc(markdown.createdAt),
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
