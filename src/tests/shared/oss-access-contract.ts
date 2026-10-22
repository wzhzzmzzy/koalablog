import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { incrementToday, readToday } from '@/db/ossAccess'

export function defineOssAccessContract(harness: {
  name: string
  env: Env
  prepare: () => Promise<void>
  cleanup?: () => Promise<void>
}) {
  describe(`OSS accounting ${harness.name} contract`, () => {
    beforeEach(harness.prepare)
    afterEach(async () => harness.cleanup?.())

    it.each(['read', 'operate'] as const)('admits exactly the configured number of concurrent %s requests', async (access) => {
      const results = await Promise.all(Array.from({ length: 110 }, () => incrementToday(harness.env, 100, access)))
      expect(results.filter(result => result.length === 1)).toHaveLength(100)
      expect(results.filter(result => result.length === 0)).toHaveLength(10)
      expect(await readToday(harness.env)).toMatchObject({ [`${access}Times`]: 100 })
      expect(await incrementToday(harness.env, 100, access)).toEqual([])
      expect(await incrementToday(harness.env, 101, access)).toHaveLength(1)
      expect(await incrementToday(harness.env, 100, access)).toEqual([])
    })

    it('treats zero as disabled and keeps read and operation budgets independent', async () => {
      for (const limit of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 0.5])
        expect(await incrementToday(harness.env, limit, 'read')).toEqual([])
      expect(await readToday(harness.env)).toBeUndefined()
      expect(await incrementToday(harness.env, 1, 'read')).toHaveLength(1)
      expect(await incrementToday(harness.env, 1, 'read')).toEqual([])
      expect(await incrementToday(harness.env, 1, 'operate')).toHaveLength(1)
      expect(await incrementToday(harness.env, 1, 'operate')).toEqual([])
      expect(await readToday(harness.env)).toMatchObject({ readTimes: 1, operateTimes: 1 })
    })
  })
}
