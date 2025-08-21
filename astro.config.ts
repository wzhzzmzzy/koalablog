import process from 'node:process'
import cloudflare from '@astrojs/cloudflare'
import svelte from '@astrojs/svelte'

import { defineConfig } from 'astro/config'
import { visualizer } from 'rollup-plugin-visualizer'
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
    plugins: [PreprocessorDirectives(), visualizer({
      emitFile: true,
      filename: 'stats.html',
    })],
    build: {
      assetsInlineLimit: 10240,
    },
  },
  integrations: [UnoCss(), svelte()],
})
