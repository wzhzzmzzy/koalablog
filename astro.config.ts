import process from 'node:process'
import cloudflare from '@astrojs/cloudflare'
import svelte from '@astrojs/svelte'
import tailwindcss from '@tailwindcss/vite'

import metaTags from 'astro-meta-tags'
import { defineConfig } from 'astro/config'
import Sonda from 'sonda/astro'
import UnoCss from 'unocss/astro'
import PreprocessorDirectives from 'unplugin-preprocessor-directives/vite'

const cfConfig = {
  adapter: cloudflare(),
}

const dashboardTailwindEntry = /[/\\]src[/\\]styles[/\\]dashboard-ui\.css(?:\?.*)?$/

/**
 * Tailwind is deliberately scoped to the non-Editor Dashboard. Its Vite
 * generator otherwise receives UnoCSS's virtual `__uno.css` module too, which
 * makes Tailwind attempt to evaluate UnoCSS-specific functions such as
 * `--spacing(...)`.
 */
const dashboardTailwindPlugins = tailwindcss().map((plugin) => {
  if (!plugin.name.startsWith('@tailwindcss/vite:generate'))
    return plugin

  if (typeof plugin.transform !== 'object')
    return plugin

  const { handler, ...hook } = plugin.transform
  return {
    ...plugin,
    transform: {
      ...hook,
      handler(code, id, options) {
        if (!dashboardTailwindEntry.test(id))
          return

        return handler.call(this, code, id, options)
      },
    },
  }
})

// https://astro.build/config
export default defineConfig({
  ...(process.env.CF_PAGES ? cfConfig : {}),
  output: 'server',
  security: {
    checkOrigin: false,
  },
  build: {
    inlineStylesheets: 'always',
  },
  vite: {
    plugins: [...dashboardTailwindPlugins, PreprocessorDirectives()],
    worker: {
      format: 'es',
    },
    optimizeDeps: {
      exclude: ['@rollup/browser'],
      include: ['@unocss/core', '@unocss/preset-uno', 'svelte/compiler'],
    },
    build: {
      assetsInlineLimit: 10240,
      sourcemap: true,
    },
  },
  integrations: [
    UnoCss(),
    svelte(),
    process.env.SONDA_ENABLED === '1' ? Sonda({ server: true }) : null,
    metaTags(),
  ].filter(i => !!i),
})
