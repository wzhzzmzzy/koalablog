import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { RENDERER_MODE } from '../lib/files/types'

export const markdown = sqliteTable('markdown', {
  id: integer().primaryKey({ autoIncrement: true }),
  source: integer().notNull(),
  path: text().notNull(),
  title: text().notNull(),
  renderer: text({ enum: [RENDERER_MODE.Markdown, RENDERER_MODE.Svelte] }).default(RENDERER_MODE.Markdown).notNull(),
  content: text().notNull(),
  sourceHash: text(),
  // format:
  // tag1,tag2,tag3
  tags: text(),
  // JSON arrays of absolute File Paths.
  incoming_links: text(),
  outgoing_links: text(),
  private: integer({ mode: 'boolean' }).default(false).notNull(),
  remoteTruth: integer({ mode: 'boolean' }).default(false).notNull(),
  revision: integer().default(1).notNull(),
  createdAt: integer({ mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer({ mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  deletedAt: integer({ mode: 'timestamp' }),
}, table => [
  uniqueIndex('markdown_active_path_unique').on(table.path).where(sql`${table.deletedAt} IS NULL`),
  index('markdown_deleted_at_idx').on(table.deletedAt),
])

export const ossAccess = sqliteTable('oss_access', {
  id: integer().primaryKey({ autoIncrement: true }),
  date: text().notNull().unique(),
  readTimes: integer().default(0),
  operateTimes: integer().default(0),
})

export const creationTemplateCatalog = sqliteTable('creation_template_catalog', {
  key: text().primaryKey(),
  schemaVersion: integer().notNull(),
  revision: integer().notNull(),
  payload: text().notNull(),
  createdAt: integer({ mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer({ mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
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
