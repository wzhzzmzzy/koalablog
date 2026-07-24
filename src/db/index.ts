import type { D1Database } from '@cloudflare/workers-types'
import { drizzle as drizzleD1 } from 'drizzle-orm/d1'
import { drizzle as drizzleSqlite } from 'drizzle-orm/libsql'
import * as schema from './schema'

export function getDataSource(env?: Env) {
  return import.meta.env.DATA_SOURCE || env?.DATA_SOURCE || 'd1'
}

export enum MarkdownSource {
  Post = 10,
  Memo = 30,
}

export const MarkdownSourceMap = {
  posts: MarkdownSource.Post,
  memos: MarkdownSource.Memo,
}

export function getSourceFromPath(path: string): MarkdownSource {
  const relativePath = path.startsWith('/') ? path.slice(1) : path
  return relativePath.startsWith('post/') ? MarkdownSource.Post : MarkdownSource.Memo
}

export function getMarkdownSourceKey(source: MarkdownSource) {
  return Object.keys(MarkdownSourceMap).find(key => MarkdownSourceMap[key as keyof typeof MarkdownSourceMap] === source) as keyof typeof MarkdownSourceMap
}

export function connectD1(DB: D1Database) {
  return drizzleD1(DB, { schema })
}

export function connectDB(env?: Env) {
  if (getDataSource(env) === 'd1' && env?.DB) {
    return connectD1(env?.DB)
  }
  return drizzleSqlite({
    connection: {
      url: import.meta.env.SQLITE_URL!,
    },
    schema,
  })
}
