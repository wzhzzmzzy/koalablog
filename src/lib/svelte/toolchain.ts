export { SVELTE_TOOLCHAIN_VERSIONS } from './toolchain-versions'
export { UNOCSS_CONFIG_HASH } from './unocss-profile'

export const SVELTE_USER_MODULE_SPECIFIERS = [
  'svelte',
  'svelte/animate',
  'svelte/easing',
  'svelte/events',
  'svelte/legacy',
  'svelte/motion',
  'svelte/reactivity',
  'svelte/reactivity/window',
  'svelte/store',
  'svelte/transition',
] as const

export const SVELTE_DEPENDENCY_LIMITS = {
  maxDepth: 8,
  maxModules: 64,
  maxModuleBytes: 512_000,
  maxTotalBytes: 4_000_000,
  fetchTimeoutMs: 10_000,
  resolutionTimeoutMs: 20_000,
} as const
