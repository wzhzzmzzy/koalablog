import type { D1Database } from '@cloudflare/workers-types'
import { PrismaD1 } from '@prisma/adapter-d1'
import { PrismaClient } from '@prisma/client'

export async function createPrisma(db: D1Database) {
  const adapter = new PrismaD1(db)
  const prisma = new PrismaClient({ adapter })

  try {
    console.log(await prisma.markdown.findFirst())
  }
  catch (e) {
    console.error(e)
  }
  return prisma
}
