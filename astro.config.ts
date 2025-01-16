import cloudflare from '@astrojs/cloudflare'
import { defineConfig } from 'astro/config'

import UnoCss from 'unocss/astro'

// https://astro.build/config
export default defineConfig({
  adapter: cloudflare(),
  output: 'server',
  integrations: [
    UnoCss(),
  ],
  vite: {
    ssr: {
      noExternal: [
        '@prisma/client',
      ],
    },
  },
})

