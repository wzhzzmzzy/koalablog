import { sql } from 'drizzle-orm'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const markdown = sqliteTable('markdown', {
  id: integer().primaryKey({ autoIncrement: true }),
  source: integer().notNull(),
  link: text().unique().notNull(),
  subject: text().unique().notNull(),
  content: text(),
  // format:
  // tag1,tag2,tag3
  tags: text(),
  // format:
  // [{subject,link},]
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

export const ossAccess = sqliteTable('oss_access', {
  id: integer().primaryKey({ autoIncrement: true }),
  date: text().notNull().unique(),
  readTimes: integer().default(0),
  operateTimes: integer().default(0),
})

// #if !CF_PAGES
export const blobStorage = sqliteTable('blob_storage', {
  id: integer().primaryKey({ autoIncrement: true }),
  key: text().notNull().unique(),
  contentType: text().notNull(),
  size: integer().notNull(),
  data: text({ mode: 'json' }).notNull(), // base64 encoded blob data
  metadata: text({ mode: 'json' }), // custom metadata as JSON
  uploadedAt: integer({ mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer({ mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
})
// #endif
