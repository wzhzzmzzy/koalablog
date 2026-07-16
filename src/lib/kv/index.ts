import type { CatppuccinTheme } from '../const/config'
// #if !CF_PAGES
import { storage } from './local'
// #endif

export interface GlobalConfig {
  pageConfig: {
    title?: string
    author?: string
    avatar?: string
    theme?: {
      light: CatppuccinTheme
      dark: CatppuccinTheme
    }
  }
  rss?: {
    enable?: boolean
    description?: string
    site?: string
    lang?: string
  }
  font?: {
    sans?: string
    serif?: string
    mono?: string
    cdn?: string
  }
  auth: {
    adminKey?: string
    guestKey?: string
    bearerToken?: string
  }
  oss: {
    operateLimit?: number
    readLimit?: number
  }
  _runtime: {
    ready: boolean
    refresh_token?: string
    refresh_expired_at?: number
  }
}

const GLOBAL_CONFIG_KEY = '_KoalaConfig_'
export const ACCESS_TOKEN_KEY = 'koala-access-token'
export const REFRESH_TOKEN_KEY = 'koala-refresh-token'

interface LocalConfigStorage {
  get: (key: string) => Promise<unknown>
  set: (key: string, value: unknown) => Promise<void>
  sync: () => Promise<void>
}

export async function globalConfig(env?: Env, localStorage: LocalConfigStorage = storage): Promise<GlobalConfig> {
  // use cloudflare kv
  if (env?.CF_PAGES) {
    const globalConfigValue = await env.KOALA.get(GLOBAL_CONFIG_KEY)

    if (globalConfigValue) {
      try {
        return JSON.parse(globalConfigValue) as GlobalConfig
      }
      catch (error) {
        console.warn('globalConfig parse failed', error)
      }
    }
  }
  // #if !CF_PAGES
  else {
    const globalConfigValue = (await localStorage.get(
      GLOBAL_CONFIG_KEY,
    )) as GlobalConfig

    if (globalConfigValue) {
      return globalConfigValue
    }
    else {
      console.warn('globalConfig is null')
    }
  }
  // #endif

  return {
    oss: {},
    pageConfig: {},
    auth: {},
    font: {},
    _runtime: { ready: false },
  }
}

function mergeGlobalConfig(currentConfig: GlobalConfig, patch: Partial<GlobalConfig>): GlobalConfig {
  const updatedConfig = { ...currentConfig }
  for (const scope of Object.keys(patch) as Array<keyof GlobalConfig>) {
    const scopePatch = patch[scope]
    if (scopePatch !== undefined) {
      updatedConfig[scope] = {
        ...currentConfig[scope],
        ...scopePatch,
      } as never
    }
  }
  return updatedConfig
}

export async function putGlobalConfig(
  env: Env,
  patch: Partial<GlobalConfig>,
  localStorage: LocalConfigStorage = storage,
) {
  const currentConfig = await globalConfig(env, localStorage)
  const updatedConfig = mergeGlobalConfig(currentConfig, patch)
  if (env?.CF_PAGES) {
    await env.KOALA.put(GLOBAL_CONFIG_KEY, JSON.stringify(updatedConfig))
  }
  // #if !CF_PAGES
  else {
    await localStorage.set(GLOBAL_CONFIG_KEY, updatedConfig)
    await localStorage.sync()
  }
  // #endif
}

export async function updateGlobalConfig<S extends keyof GlobalConfig>(
  env: Env,
  payload: Record<S, Partial<GlobalConfig[S]>>,
  localStorage: LocalConfigStorage = storage,
) {
  const currentConfig = await globalConfig(env, localStorage)
  const updatedConfig = mergeGlobalConfig(currentConfig, payload)

  if (env?.CF_PAGES) {
    await env.KOALA.put(GLOBAL_CONFIG_KEY, JSON.stringify(updatedConfig))
  }
  // #if !CF_PAGES
  else {
    await localStorage.set(GLOBAL_CONFIG_KEY, updatedConfig)
    await localStorage.sync()
  }
  // #endif
}
