import { format, startOfDay } from 'date-fns'
import { and, eq } from 'drizzle-orm'
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
  const todayAccess = await tx.query.ossAccess.findFirst({
    where: and(
      eq(ossAccess.date, today),
    ),
  })

  if (todayAccess) {
    if ((todayAccess[`${access}Times`] || 0) > limit) {
      return [todayAccess]
    }
    return tx.update(ossAccess).set({
      [`${access}Times`]: (todayAccess[`${access}Times`] || 0) + 1,
    }).where(eq(ossAccess.id, todayAccess.id)).returning()
  }
  else {
    return tx.insert(ossAccess).values({
      date: today,
      [`${access}Times`]: 1,
    }).returning()
  }
}
