import { parse } from 'node-html-parser'
import { describe, expect, it } from 'vitest'
import { md } from '@/lib/markdown'

describe('markdown preview with an unregistered fence language', () => {
  it.each(['svelte', 'unregistered-code-language'])('keeps surrounding content and safely renders %s as text', async (language) => {
    const renderer = await md()
    const html = renderer.render([
      '# Before',
      '',
      `~~~${language}`,
      '<script>alert("sample")</script>',
      '~~~',
      '',
      'After the fence.',
    ].join('\n'))

    expect(html).toContain('Before')
    expect(html).toContain('After the fence.')
    const rendered = parse(html, { blockTextElements: { script: true, style: true, noscript: true } })
    expect(rendered.querySelector('code')?.text).toBe('<script>alert("sample")</script>')
    expect(rendered.querySelector('script')).toBeNull()
    expect(html).toContain('code-block')
  })
})
