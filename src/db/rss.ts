import { and, desc, eq, gt, isNull, or } from 'drizzle-orm'
import { connectDB, MarkdownSource } from '.'
import { markdown, markdownRenders } from './schema'

export async function getRSSData(env: Env) {
  const db = connectDB(env)

  const rows = await db.select()
    .from(markdown)
    .leftJoin(markdownRenders, eq(markdown.id, markdownRenders.markdownId))
    .where(and(
      or(
        eq(markdown.source, MarkdownSource.Memo),
        eq(markdown.source, MarkdownSource.Post),
      ),
      eq(markdown.deleted, false),
      eq(markdown.private, false),
    ))
    .orderBy(desc(markdown.createdAt))

  return rows.map(({ markdown: m, markdown_renders: mr }) => ({
    subject: m.subject,
    link: m.link,
    tags: m.tags,
    createdAt: m.createdAt,
    content: m.content,
    htmlContent: mr?.htmlContent ?? null,
  }))
}

export async function getRenderCandidates(env: Env, limit = 5) {
  const db = connectDB(env)

  const rows = await db.select()
    .from(markdown)
    .leftJoin(markdownRenders, eq(markdown.id, markdownRenders.markdownId))
    .where(
      and(
        eq(markdown.deleted, false),
        or(
          isNull(markdownRenders.updatedAt),
          gt(markdown.updatedAt, markdownRenders.updatedAt),
        ),
      ),
    )
    .orderBy(desc(markdown.updatedAt))
    .limit(limit)

  return rows.map(({ markdown: m }) => m)
}

export async function saveRender(env: Env, markdownId: number, htmlContent: string) {
  const db = connectDB(env)
  return db.insert(markdownRenders)
    .values({
      markdownId,
      htmlContent,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: markdownRenders.markdownId,
      set: {
        htmlContent,
        updatedAt: new Date(),
      },
    })
}
