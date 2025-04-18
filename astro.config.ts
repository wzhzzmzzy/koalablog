import process from 'node:process'
import cloudflare from '@astrojs/cloudflare'
import svelte from '@astrojs/svelte'

import { defineConfig } from 'astro/config'
import UnoCss from 'unocss/astro'

const cfConfig = {
  adapter: cloudflare(),
}

console.log('build-time:process.env', process.env)

// https://astro.build/config
export default defineConfig({
  ...(process.env.CF_PAGES ? cfConfig : {}),
  output: 'server',
  integrations: [UnoCss(), svelte()],
})
