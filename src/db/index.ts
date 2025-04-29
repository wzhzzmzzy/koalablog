import type { D1Database } from '@cloudflare/workers-types'
import { drizzle as drizzleD1 } from 'drizzle-orm/d1'
import { drizzle as drizzleSqlite } from 'drizzle-orm/libsql'
import * as schema from './schema'

export function getDataSource(env?: Env) {
  return import.meta.env.DATA_SOURCE || env?.DATA_SOURCE || 'd1'
}

export enum MarkdownSource {
  Home = 1,
  Nav = 2,
  Post = 10,
  Page = 20,
  Unknown = 99,
}

export const isPresetSource = (source: MarkdownSource) => source === MarkdownSource.Home || source === MarkdownSource.Nav
export type PostOrPage = MarkdownSource.Post | MarkdownSource.Page
export type PresetSource = MarkdownSource.Home | MarkdownSource.Nav

export const MarkdownSourceMap = {
  home: MarkdownSource.Home,
  nav: MarkdownSource.Nav,
  posts: MarkdownSource.Post,
  pages: MarkdownSource.Page,
}

export const MarkdownSubjectMap: Record<MarkdownSource, string> = {
  [MarkdownSource.Home]: 'Home',
  [MarkdownSource.Nav]: 'Nav',
  [MarkdownSource.Post]: 'Posts',
  [MarkdownSource.Page]: 'Pages',
  [MarkdownSource.Unknown]: '404',
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
