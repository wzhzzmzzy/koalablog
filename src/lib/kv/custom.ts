// #if !CF_PAGES
import { storage } from './local'
// #endif

export async function getConfig(env: Env | undefined, key: string) {
  // use cloudflare kv
  if (env?.CF_PAGES) {
    return env.KOALA.get(key)
  }
  // #if !CF_PAGES
  else {
    return await storage.get(key)
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
