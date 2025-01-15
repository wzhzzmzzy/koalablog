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
}

export const MarkdownSubjectMap = {
  [MarkdownSource.Home]: 'Home',
  [MarkdownSource.Nav]: 'Nav',
}
