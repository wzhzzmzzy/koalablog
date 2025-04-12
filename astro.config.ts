import process from 'node:process'
import cloudflare from '@astrojs/cloudflare'
import svelte from '@astrojs/svelte'

import { defineConfig } from 'astro/config'

import UnoCss from 'unocss/astro'

const cfConfig = {
  adapter: cloudflare(),
}

console.log('import', import.meta.env)
console.log('process', process.env)

// https://astro.build/config
export default defineConfig({
  ...(import.meta.env.CF_PAGES ? cfConfig : {}),
  output: 'server',
  integrations: [UnoCss(), svelte()],
})
