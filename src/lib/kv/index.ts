import type { CatppuccinTheme } from '../const/config'
// #if !CF_PAGES
import consola from 'consola'
import { storage } from './local'
// #endif

export interface GlobalConfig {
  pageConfig: {
    title?: string
    theme?: {
      light: CatppuccinTheme
      dark: CatppuccinTheme
    }
  }
  auth: {
    adminKey?: string
  }
  oss: {
    operateLimit?: number
    readLimit?: number
  }
  _runtime: {
    ready: boolean
    access_token?: string
    access_expired_at?: number
    refresh_token?: string
    refresh_expired_at?: number
  }
}

const GLOBAL_CONFIG_KEY = '_KoalaConfig_'
export const ACCESS_TOKEN_KEY = 'koala-access-token'
export const REFRESH_TOKEN_KEY = 'koala-refresh-token'

export async function globalConfig({ KOALA, CF_PAGES }: Env): Promise<GlobalConfig> {
  // use cloudflare kv
  if (CF_PAGES) {
    const globalConfigValue = await KOALA.get(GLOBAL_CONFIG_KEY)

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
    const globalConfigValue = await storage.get(GLOBAL_CONFIG_KEY) as GlobalConfig

    if (globalConfigValue) {
      return globalConfigValue
    }
    else {
      consola.warn('globalConfig is null')
    }
  }
  // #endif

  return {
    oss: {},
    pageConfig: {},
    auth: {},
    _runtime: { ready: false },
  }
}

export async function putGlobalConfig(env: Env, patch: Partial<GlobalConfig>) {
  const currentConfig = await globalConfig(env)
  const updatedScopeConfig = { ...currentConfig, ...patch }
  if (env.CF_PAGES) {
    await env.KOALA.put(GLOBAL_CONFIG_KEY, JSON.stringify(updatedScopeConfig))
  }
  // #if !CF_PAGES
  else {
    await storage.set(GLOBAL_CONFIG_KEY, updatedScopeConfig)
  }
  // #endif
}

export async function updateGlobalConfig<S extends keyof GlobalConfig>(env: Env, scope: S, patch: Partial<GlobalConfig[S]>) {
  const currentConfig = await globalConfig(env)
  const updatedScopeConfig = { ...currentConfig[scope], ...patch }
  const payload = {
    ...currentConfig,
    [scope]: updatedScopeConfig,
  }
  if (env.CF_PAGES) {
    await env.KOALA.put(GLOBAL_CONFIG_KEY, JSON.stringify(payload))
  }
  // #if !CF_PAGES
  else {
    await storage.set(GLOBAL_CONFIG_KEY, payload)
    await storage.sync()
  }
  // #endif
}
