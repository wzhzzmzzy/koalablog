import { getViteConfig } from 'astro/config'
import { defineConfig, mergeConfig } from 'vitest/config'

export default defineConfig(async (env) => {
  const astroViteConfig = await getViteConfig({})(env)

  return mergeConfig(astroViteConfig, {
    test: {
      onConsoleLog: () => true,
    },
  })
})
