/// <reference types="astro/client" />

// use a default runtime configuration (advanced mode).
type Runtime = import('@astrojs/cloudflare').Runtime<Env>
declare namespace App {
  interface Locals extends Runtime {
    config: import('@/lib/kv').GlobalConfig
    session: {
      authed: boolean
    }
  }
  type Env = Env
}

interface ImportMetaEnv {
  readonly DATA_SOURCE?: 'd1' | 'sqlite'
  readonly SQLITE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
