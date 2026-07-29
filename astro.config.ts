import process from 'node:process'
import cloudflare from '@astrojs/cloudflare'
import svelte from '@astrojs/svelte'
import tailwindcss from '@tailwindcss/vite'

import metaTags from 'astro-meta-tags'
import { defineConfig } from 'astro/config'
import Sonda from 'sonda/astro'
import PreprocessorDirectives from 'unplugin-preprocessor-directives/vite'

const cfConfig = {
  adapter: cloudflare(),
}

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
    plugins: [tailwindcss(), PreprocessorDirectives()],
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
    svelte(),
    process.env.SONDA_ENABLED === '1' ? Sonda({ server: true }) : null,
    metaTags(),
  ].filter(i => !!i),
})
