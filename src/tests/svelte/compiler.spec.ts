import { compileSvelteSource } from '@/workers/svelte/compiler'
import { describe, expect, it } from 'vitest'

describe('svelte Worker compiler', () => {
  it('compiles ordinary Svelte, plain CSS, and erasable TypeScript', async () => {
    const source = `<script lang="ts">
  let name: string = 1
</script>

<h1 class="greeting">{name}</h1>

<style>
  .greeting { color: rebeccapurple; }
</style>`

    const result = await compileSvelteSource(source)

    expect(result).toMatchObject({ ok: true, warnings: [] })
    if (!result.ok)
      return
    expect(result.javascript).toContain('name = 1')
    expect(result.css).toContain('.greeting')
  })

  it.each([
    ['enum', '<script lang="ts">enum Tone { Red }</script><p>ok</p>', 'typescript_invalid_feature'],
    ['Sass', '<style lang="sass">p\n  color: red</style><p>ok</p>', 'unsupported_preprocessor'],
    ['Less', '<style lang="less">p { color: red; }</style><p>ok</p>', 'unsupported_preprocessor'],
    ['Pug', '<template lang="pug">p ok</template>', 'unsupported_preprocessor'],
    ['svelte head', '<svelte:head><title>Koala</title></svelte:head><p>ok</p>', 'svelte_head_not_supported'],
    ['compiler syntax', '<p>{</p>', 'js_parse_error'],
  ])('returns a structured diagnostic for unsupported %s syntax', async (_label, source, code) => {
    const result = await compileSvelteSource(source)

    expect(result).toMatchObject({
      ok: false,
      error: { code, severity: 'error' },
    })
    if (!result.ok) {
      expect(result.error.start).toBeGreaterThanOrEqual(0)
      expect(result.error.end).toBeGreaterThanOrEqual(result.error.start)
    }
  })

  it('keeps compiler offsets in UTF-16 positions compatible with CodeMirror', async () => {
    const source = '😀\n<p>{</p>'
    const result = await compileSvelteSource(source)

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'js_parse_error', start: 7, end: 7 },
    })
  })
})
