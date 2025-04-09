interface GlobalConfig {
  title: string
  adminKey?: string
  adminEmail?: string
  onboardingFinished: boolean
}

const GLOBAL_CONFIG_KEY = 'globalConfig'

export async function globalConfig(kv: KVNamespace): Promise<GlobalConfig> {
  const globalConfigValue = await kv.get(GLOBAL_CONFIG_KEY)

  if (globalConfigValue) {
    try {
      return JSON.parse(globalConfigValue) as GlobalConfig
    }
    catch (error) {
      console.warn('globalConfig parse failed', error)
    }
  }

  return { title: 'KoalaDev', onboardingFinished: false }
}

export async function putGlobalConfig(kv: KVNamespace, patch: Partial<GlobalConfig>) {
  const currentConfig = await globalConfig(kv)
  const updatedConfig = { ...currentConfig, ...patch }
  await kv.put(GLOBAL_CONFIG_KEY, JSON.stringify(updatedConfig))
}
