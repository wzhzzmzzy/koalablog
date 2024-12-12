/// <reference types="astro/client" />

type KVNamespace = import('@cloudflare/workers-types').KVNamespace
interface ENV {
  KOALA: KVNamespace
}

// use a default runtime configuration (advanced mode).
type Runtime = import('@astrojs/cloudflare').Runtime<ENV>
declare namespace App {
  interface Locals extends Runtime {}
}
