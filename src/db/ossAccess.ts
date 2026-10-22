import { format, startOfDay } from 'date-fns'
import { and, eq, sql } from 'drizzle-orm'
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
  if (!Number.isFinite(limit) || limit < 1)
    return []
  const today = format(startOfDay(new Date()), 'yyyyMMdd')
  const countColumn = access === 'read' ? ossAccess.readTimes : ossAccess.operateTimes
  return connectDB(env).insert(ossAccess).values({
    date: today,
    [`${access}Times`]: 1,
  }).onConflictDoUpdate({
    target: ossAccess.date,
    set: { [`${access}Times`]: sql`coalesce(${countColumn}, 0) + 1` },
    setWhere: sql`coalesce(${countColumn}, 0) < ${Math.floor(limit)}`,
  }).returning()
}
