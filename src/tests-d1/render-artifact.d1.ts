import { resetD1ForOnboarding } from '@/db/onboarding'
import { defineRenderArtifactContract } from '@/tests/shared/render-artifact-contract'
import { env } from 'cloudflare:test'
import initSql from '../../migrations/0000_init.sql?raw'

defineRenderArtifactContract({
  name: 'D1',
  env,
  prepare: async () => {
    await resetD1ForOnboarding(env, [initSql])
  },
})
