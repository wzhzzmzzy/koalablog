import process from 'node:process'
import cloudflare from '@astrojs/cloudflare'
import svelte from '@astrojs/svelte'

import metaTags from 'astro-meta-tags'
import { defineConfig } from 'astro/config'
import Sonda from 'sonda/astro'
import UnoCss from 'unocss/astro'

import PreprocessorDirectives from 'unplugin-preprocessor-directives/vite'

const cfConfig = {
  adapter: cloudflare(),
}

// https://astro.build/config
export default defineConfig({
  ...(process.env.CF_PAGES ? cfConfig : {}),
  output: 'server',
  vite: {
    plugins: [PreprocessorDirectives()],
    build: {
      assetsInlineLimit: 10240,
      sourcemap: true,
    },
  },
  integrations: [UnoCss(), svelte(), Sonda({ server: true }), metaTags()],
})

