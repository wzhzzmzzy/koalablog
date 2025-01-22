import { sql } from 'drizzle-orm'
import { int, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const markdown = sqliteTable('markdown', {
  id: int().primaryKey({ autoIncrement: true }),
  source: int().notNull(),
  link: text().unique().notNull(),
  subject: text().unique().notNull(),
  content: text(),
  tags: text(),
  incoming_links: text(),
  outgoing_links: text(),
  createdAt: int({ mode: 'timestamp' }).default(sql`(CURRENT_TIMESTAMP)`).notNull(),
  updatedAt: int({ mode: 'timestamp' }).default(sql`(CURRENT_TIMESTAMP)`).notNull(),
  deleted: int({ mode: 'boolean' }).default(false).notNull(),
})
