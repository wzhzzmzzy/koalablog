// #if !CF_PAGES
import { storage } from './local'
// #endif

export async function getConfig(env: Env | undefined, key: string): Promise<string | null> {
  // use cloudflare kv
  if (env?.CF_PAGES) {
    return env.KOALA.get(key)
  }
  // #if !CF_PAGES
  else {
    const value = await storage.get(key)
    return typeof value === 'string' ? value : null
  }
  // #endif
  return ''
}

export async function putConfig(env: Env | undefined, key: string, value: string) {
  if (env?.CF_PAGES) {
    await env.KOALA.put(key, value)
  }
  // #if !CF_PAGES
  else {
    await storage.set(key, value)
    await storage.sync()
  }
  // #endif
}
