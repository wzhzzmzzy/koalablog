import { sql } from 'drizzle-orm'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const markdown = sqliteTable('markdown', {
  id: integer().primaryKey({ autoIncrement: true }),
  source: integer().notNull(),
  link: text().unique().notNull(),
  subject: text().unique().notNull(),
  content: text(),
  tags: text(),
  incoming_links: text(),
  outgoing_links: text(),
  private: integer({ mode: 'boolean' }).default(false).notNull(),
  createdAt: integer({ mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer({ mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  deleted: integer({ mode: 'boolean' }).default(false).notNull(),
})
