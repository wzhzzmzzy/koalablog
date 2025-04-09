import cloudflare from '@astrojs/cloudflare'
import svelte from '@astrojs/svelte'

import { defineConfig } from 'astro/config'

import UnoCss from 'unocss/astro'

// https://astro.build/config
export default defineConfig({
  adapter: cloudflare(),
  output: 'server',
  integrations: [UnoCss(), svelte()],
})
