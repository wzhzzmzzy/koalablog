import { format, startOfDay } from 'date-fns'
import { and, eq, lte, sql } from 'drizzle-orm'
import { connectDB } from '.'
import { ossAccess } from './schema'

export function readToday(env: Env) {
  const today = format(startOfDay(new Date()), 'yyyyMMdd')

  return connectDB(env).query.ossAccess.findFirst({
    where: and(
      eq(ossAccess.date, today),
    ),
  })
}

export async function incrementToday(env: Env, limit: number, access: 'read' | 'operate') {
  const today = format(startOfDay(new Date()), 'yyyyMMdd')
  const tx = connectDB(env)
  const countColumn = access === 'read' ? ossAccess.readTimes : ossAccess.operateTimes

  await tx.insert(ossAccess).values({ date: today }).onConflictDoNothing({
    target: ossAccess.date,
  })

  const updated = await tx.update(ossAccess).set({
    [`${access}Times`]: sql`coalesce(${countColumn}, 0) + 1`,
  }).where(and(
    eq(ossAccess.date, today),
    lte(countColumn, limit),
  )).returning()
  if (updated.length > 0)
    return updated

  const todayAccess = await readToday(env)
  return todayAccess ? [todayAccess] : []
}
