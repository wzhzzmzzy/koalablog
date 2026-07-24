import { createHash } from 'node:crypto'
import { UNOCSS_CONFIG_HASH, UNOCSS_CONFIG_SERIALIZATION } from '@/lib/svelte/unocss-profile'
import { compileSvelteSource } from '@/workers/svelte/compiler'
import {
  extractUnoCssTokens,
  generateUnoCss,
} from '@/workers/svelte/unocss'
import { describe, expect, it } from 'vitest'

describe('svelte Artifact UnoCSS', () => {
  it('extracts only static class segments and class directives from the Svelte template AST', async () => {
    const source = `<script>
  const ignored = 'text-fuchsia-500'
  const dynamic = 'text-sky-500'
</script>

<p>text-amber-500</p>
<div class="font-ui text-red-500 {dynamic}" class:bg-green-500={active}>
  <span class="underline">Koala</span>
</div>`

    await expect(extractUnoCssTokens(source)).resolves.toEqual([
      'bg-green-500',
      'font-ui',
      'text-red-500',
      'underline',
    ])
  })

  it('generates root-scoped utilities before transformed component CSS', async () => {
    const source = `<div class="card font-ui text-red-500" class:bg-green-500={active}>Koala</div>
<style>.card { --at-apply: p-2 text-blue-500; }</style>`
    const compiled = await compileSvelteSource(source)

    if (!compiled.ok)
      throw new Error(compiled.error.message)
    const css = await generateUnoCss(source, compiled.css)

    expect(css).toContain(':where([data-koala-artifact-root]) .font-ui')
    expect(css).toContain(':where([data-koala-artifact-root]) .text-red-500')
    expect(css).toContain(':where([data-koala-artifact-root]) .bg-green-500')
    expect(css).toMatch(/\.card\.svelte-[\w-]+\s?\{/)
    expect(css).not.toContain('--at-apply')
    expect(css.indexOf('.text-red-500')).toBeLessThan(css.indexOf('.card.svelte-'))
  })

  it('keeps the canonical profile hash fixed', () => {
    expect(createHash('sha256').update(UNOCSS_CONFIG_SERIALIZATION).digest('hex')).toBe(UNOCSS_CONFIG_HASH)
  })
})
