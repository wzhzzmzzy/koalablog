import type { D1Database } from '@cloudflare/workers-types'
import { PrismaD1 } from '@prisma/adapter-d1'
import { PrismaClient } from '@prisma/client'

export function createPrisma(db: D1Database) {
  const adapter = new PrismaD1(db)
  const prisma = new PrismaClient({ adapter })

  return prisma
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
