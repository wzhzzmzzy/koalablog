import type { LocalConfigStorage } from '@/lib/kv'
import { hashApiToken } from '@/lib/auth/api-token'
import { hashPassword } from '@/lib/auth/password'
import { globalConfig, updateGlobalConfig } from '@/lib/kv'
import { assignAllFilesToUser, countUsers, createApiToken, createUser } from './user'

interface UserMigrationOptions {
  configStorage?: LocalConfigStorage
}

export async function ensureUserMigration(env: Env, options: UserMigrationOptions = {}): Promise<void> {
  if (await countUsers(env) > 0)
    return

  const config = await globalConfig(env, options.configStorage)
  const adminKey = config.auth?.adminKey
  if (!adminKey)
    return

  const { salt, hash } = await hashPassword(adminKey)
  const admin = await createUser(env, { username: 'admin', passwordHash: hash, passwordSalt: salt, role: 'admin' })
  await assignAllFilesToUser(env, admin.id)

  if (config.auth.bearerToken) {
    await createApiToken(env, {
      userId: admin.id,
      tokenHash: await hashApiToken(config.auth.bearerToken),
      label: 'migrated-bearer',
    })
  }

  await updateGlobalConfig(
    env,
    { auth: { adminKey: undefined, guestKey: undefined, bearerToken: undefined } },
    options.configStorage,
  )
}
