import type { SSRManifest } from 'astro'
import { handle } from '@astrojs/cloudflare/handler'
import { App } from 'astro/app'
import { processMarkdownRenders } from './lib/utils/cron-render'

export function createExports(manifest: SSRManifest) {
  const app = new App(manifest)
  return {
    default: {
      async fetch(request, env, ctx) {
        return handle(manifest, app, request as any, env as any, ctx)
      },
      async scheduled(controller, env, ctx) {
        ctx.waitUntil(processMarkdownRenders(env))
      },
    } satisfies ExportedHandler<Env>,
  }
}
