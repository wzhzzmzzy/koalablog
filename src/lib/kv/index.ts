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
  maintenance?: {
    sourceHashBackfill?: SourceHashBackfillMaintenance
  }
  _runtime: {
    ready: boolean
    refresh_token?: string
    refresh_expired_at?: number
  }
}

export interface SourceHashBackfillMaintenance {
  active: boolean
  applicationCommit?: string
  startedAt?: string
  completedAt?: string
  lastAudit?: {
    status: 'ready' | 'blocked'
    total: number
    active: number
    recycled: number
    current: number
    missing: number
    mismatched: number
    invalid: number
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

export async function globalConfig(env?: Env, localStorage?: LocalConfigStorage): Promise<GlobalConfig> {
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
    const configStorage = localStorage ?? storage
    const globalConfigValue = (await configStorage.get(
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
  const pageConfig = {
    ...currentConfig.pageConfig,
    ...patch.pageConfig,
  }
  if (patch.pageConfig?.theme) {
    pageConfig.theme = {
      ...currentConfig.pageConfig.theme,
      ...patch.pageConfig.theme,
    }
  }

  const maintenance = patch.maintenance === undefined
    ? currentConfig.maintenance
    : {
        ...currentConfig.maintenance,
        ...patch.maintenance,
        sourceHashBackfill: patch.maintenance.sourceHashBackfill === undefined
          ? currentConfig.maintenance?.sourceHashBackfill
          : {
              ...currentConfig.maintenance?.sourceHashBackfill,
              ...patch.maintenance.sourceHashBackfill,
            },
      }

  return {
    pageConfig,
    rss: patch.rss === undefined ? currentConfig.rss : { ...currentConfig.rss, ...patch.rss },
    font: patch.font === undefined ? currentConfig.font : { ...currentConfig.font, ...patch.font },
    auth: { ...currentConfig.auth, ...patch.auth },
    oss: { ...currentConfig.oss, ...patch.oss },
    maintenance,
    _runtime: { ...currentConfig._runtime, ...patch._runtime },
  }
}

export function sourceHashBackfillMaintenance(config: GlobalConfig): SourceHashBackfillMaintenance {
  return config.maintenance?.sourceHashBackfill ?? { active: false }
}

export async function putGlobalConfig(
  env: Env,
  patch: Partial<GlobalConfig>,
  localStorage?: LocalConfigStorage,
) {
  const currentConfig = await globalConfig(env, localStorage)
  const updatedConfig = mergeGlobalConfig(currentConfig, patch)
  if (env?.CF_PAGES) {
    await env.KOALA.put(GLOBAL_CONFIG_KEY, JSON.stringify(updatedConfig))
  }
  // #if !CF_PAGES
  else {
    const configStorage = localStorage ?? storage
    await configStorage.set(GLOBAL_CONFIG_KEY, updatedConfig)
    await configStorage.sync()
  }
  // #endif
}

export async function updateGlobalConfig<S extends keyof GlobalConfig>(
  env: Env,
  payload: Record<S, Partial<GlobalConfig[S]>>,
  localStorage?: LocalConfigStorage,
) {
  const currentConfig = await globalConfig(env, localStorage)
  const updatedConfig = mergeGlobalConfig(currentConfig, payload)

  if (env?.CF_PAGES) {
    await env.KOALA.put(GLOBAL_CONFIG_KEY, JSON.stringify(updatedConfig))
  }
  // #if !CF_PAGES
  else {
    const configStorage = localStorage ?? storage
    await configStorage.set(GLOBAL_CONFIG_KEY, updatedConfig)
    await configStorage.sync()
  }
  // #endif
}
