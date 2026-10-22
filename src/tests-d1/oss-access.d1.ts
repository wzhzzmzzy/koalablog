import { env } from 'cloudflare:test'
import { resetD1ForOnboarding } from '@/db/onboarding'
import { defineOssAccessContract } from '@/tests/shared/oss-access-contract'
import initSql from '../../migrations/0000_init.sql?raw'
import userSchemaSql from '../../migrations/0002_user.sql?raw'

defineOssAccessContract({
  name: 'D1',
  env,
  prepare: async () => {
    await resetD1ForOnboarding(env, [initSql, userSchemaSql])
  },
})
