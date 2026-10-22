import type { LocalConfigStorage } from '@/lib/kv'
import { globalConfig } from '@/lib/kv'
import { ensureTemplateCatalogInitialized } from './template-catalog'
import { countUsers } from './user'
import { ensureUserMigration } from './user-migration'

export async function initializeExistingInstallation(env: Env, configStorage?: LocalConfigStorage) {
  const config = await globalConfig(env, configStorage)
  if (!config._runtime?.ready)
    throw new Error('Site is not initialized; complete onboarding instead')

  await ensureTemplateCatalogInitialized(env)
  await ensureUserMigration(env, { configStorage })
  if (await countUsers(env) === 0)
    throw new Error('No User or legacy admin key exists; restore the installation before upgrading')
}
