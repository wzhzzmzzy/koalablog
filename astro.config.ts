import { defineConfig } from 'astro/config';
import UnoCss from 'unocss/astro';

import cloudflare from '@astrojs/cloudflare';

// https://astro.build/config
export default defineConfig({
  adapter: cloudflare(),
  output: 'server',
  integrations: [
      UnoCss()
  ]
});