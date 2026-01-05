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

export async function globalConfig(env?: Env): Promise<GlobalConfig> {
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
    const globalConfigValue = (await storage.get(
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

export async function putGlobalConfig(env: Env, patch: Partial<GlobalConfig>) {
  const currentConfig = await globalConfig(env)
  const updatedScopeConfig = { ...currentConfig, ...patch }
  if (env?.CF_PAGES) {
    await env.KOALA.put(GLOBAL_CONFIG_KEY, JSON.stringify(updatedScopeConfig))
  }
  // #if !CF_PAGES
  else {
    await storage.set(GLOBAL_CONFIG_KEY, updatedScopeConfig)
  }
  // #endif
}

export async function updateGlobalConfig<S extends keyof GlobalConfig>(
  env: Env,
  payload: Record<S, Partial<GlobalConfig[S]>>,
) {
  const currentConfig = await globalConfig(env)
  const updatedConfig = { ...currentConfig }
  Object.keys(payload).forEach((scope) => {
    const patch = payload[scope as S]

    const updatedScopeConfig = { ...currentConfig[scope as S], ...patch }
    updatedConfig[scope as S] = updatedScopeConfig
  })

  if (env?.CF_PAGES) {
    await env.KOALA.put(GLOBAL_CONFIG_KEY, JSON.stringify(updatedConfig))
  }
  // #if !CF_PAGES
  else {
    await storage.set(GLOBAL_CONFIG_KEY, payload)
    await storage.sync()
  }
  // #endif
}
