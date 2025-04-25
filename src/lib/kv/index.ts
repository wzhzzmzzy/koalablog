// #if !CF_PAGES
import { storage } from './local'
// #endif

interface GlobalConfig {
  title?: string
  adminKey?: string
  adminEmail?: string
  onboardingFinished: boolean
}

const GLOBAL_CONFIG_KEY = 'globalConfig'

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
  else {
    // #if !CF_PAGES
    const globalConfigValue = await storage.get(GLOBAL_CONFIG_KEY) as GlobalConfig

    if (globalConfigValue) {
      return globalConfigValue
    }
    else {
      console.warn('globalConfig is null')
    }
    // #endif
  }

  return { onboardingFinished: false }
}

export async function putGlobalConfig(env: Env, patch: Partial<GlobalConfig>) {
  const currentConfig = await globalConfig(env)
  const updatedConfig = { ...currentConfig, ...patch }
  if (env.CF_PAGES) {
    await env.KOALA.put(GLOBAL_CONFIG_KEY, JSON.stringify(updatedConfig))
  }
  else {
    // await storage.set(GLOBAL_CONFIG_KEY, updatedConfig)
  }
}
