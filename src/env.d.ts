/// <reference types="astro/client" />
// use a default runtime configuration (advanced mode).
type Runtime = import('@astrojs/cloudflare').Runtime<Env>
declare namespace App {
  interface Locals extends Runtime {
    user: import('better-auth').User | null
    session: import('better-auth').Session | null
  }
  type Env = Env
}

interface ImportMetaEnv {
  readonly DB?: 'd1' | 'sqlite'
  readonly SQLITE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
