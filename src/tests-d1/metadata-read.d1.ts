import { env } from 'cloudflare:test'
import { resetD1ForOnboarding } from '@/db/onboarding'
import { defineMetadataReadContract } from '@/tests/shared/metadata-read-contract'
import initSql from '../../migrations/0000_init.sql?raw'
import userSchemaSql from '../../migrations/0002_user.sql?raw'
import artifactSchemaSql from '../../migrations/0003_artifact_objects.sql?raw'

defineMetadataReadContract({
  name: 'D1',
  env,
  prepare: async () => {
    await resetD1ForOnboarding(env, [initSql, userSchemaSql, artifactSchemaSql])
  },
})
