import antfu from '@antfu/eslint-config'

export default antfu({
  typescript: true,
  astro: true,
}, {
  ignores: ['src/lib/svelte/runtime-registry.generated.ts'],
})
