import { describe, expect, it } from 'vitest'
import { getSvelteBrief } from '@/lib/files/svelte-brief'

describe('svelte brief', () => {
  it('reads a multiline brief after whitespace and other leading comments', () => {
    expect(getSvelteBrief('\uFEFF\r\n<!-- License -->\n<!--\n @brief: 桌面布线规划。\r\n 调整位置、连接和长度。 \n-->\n<script>let count = 0</script>'))
      .toBe('桌面布线规划。 调整位置、连接和长度。')
  })

  it('keeps brief text literal rather than evaluating markup or expressions', () => {
    expect(getSvelteBrief('<!-- @brief: <b>Compare</b> A & B, **bold**, {count} and &amp;. -->'))
      .toBe('<b>Compare</b> A & B, **bold**, {count} and &amp;.')
  })

  it('uses the first brief comment', () => {
    expect(getSvelteBrief('<!-- @brief: First. --><!-- @brief: Second. -->')).toBe('First.')
    expect(getSvelteBrief('<!-- @brief: \n --><!-- @brief: Second. -->')).toBe('')
  })

  it.each([
    undefined,
    null,
    '',
    '<!-- @brief: unclosed',
    '<!-- @Brief: Wrong case. -->',
    '<!-- @briefly: Wrong marker. -->',
    '<!-- Example: @brief: Not a tag. -->',
    '<script>const example = "<!-- @brief: Script string. -->"</script>',
    '<style>/* <!-- @brief: Style comment. --> */</style>',
    '<main><!-- @brief: Nested comment. --></main>',
    '{#if true}<!-- @brief: Nested block. -->{/if}',
    '<!-- Ordinary comment. --><h1>Page</h1><!-- @brief: Too late. -->',
  ])('returns no summary for missing or non-header metadata: %s', (source) => {
    expect(getSvelteBrief(source)).toBe('')
  })
})
