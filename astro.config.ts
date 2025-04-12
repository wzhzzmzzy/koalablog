import cloudflare from '@astrojs/cloudflare'
import svelte from '@astrojs/svelte'

import { defineConfig } from 'astro/config'

import UnoCss from 'unocss/astro'

const cfConfig = {
  adapter: cloudflare(),
}

// https://astro.build/config
export default defineConfig({
  ...(import.meta.env.CF_PAGES ? cfConfig : {}),
  output: 'server',
  integrations: [UnoCss(), svelte()],
})
