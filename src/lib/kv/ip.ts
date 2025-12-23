const IP_CONFIG_KEY = 'HomeLabIP'

export async function ipConfig(env?: Env) {
  // use cloudflare kv
  if (env?.CF_PAGES) {
    return env.KOALA.get(IP_CONFIG_KEY)
  }

  return ''
}

export async function putIpConfig(env: Env, ip: string) {
  if (env?.CF_PAGES) {
    await env.KOALA.put(IP_CONFIG_KEY, ip)
  }
}
