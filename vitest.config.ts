import { getViteConfig } from 'astro/config'
import { configDefaults, defineConfig, mergeConfig } from 'vitest/config'

export default defineConfig(async (env) => {
  const astroViteConfig = await getViteConfig({})(env)

  return mergeConfig(astroViteConfig, {
    test: {
      exclude: [...configDefaults.exclude, 'tests/e2e/**'],
      onConsoleLog: () => true,
    },
  })
})
