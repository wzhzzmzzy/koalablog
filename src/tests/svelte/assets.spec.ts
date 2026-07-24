import { svelteResolverPolicyDiagnostics } from '@/workers/svelte/resolver-policy'
import { describe, expect, it } from 'vitest'

describe('svelte static asset policy', () => {
  it('accepts slash-leading and absolute HTTPS markup, srcset, and CSS assets', async () => {
    const diagnostics = await svelteResolverPolicyDiagnostics(`<img src="/images/koala.png" srcset="/images/koala.png 1x, https://cdn.example.test/koala@2x.png 2x" />
<video poster="https://cdn.example.test/poster.jpg" src="/media/koala.mp4"></video>
<style>
  .koala { background-image: url('/images/koala.png'); }
  @font-face { src: url(https://cdn.example.test/koala.woff2); }
</style>`)

    expect(diagnostics).toEqual([])
  })

  it.each([
    ['relative markup URL', '<img src="images/koala.png" />'],
    ['protocol-relative markup URL', '<img src="//cdn.example.test/koala.png" />'],
    ['non-absolute HTTPS markup URL', '<img src="https:koala.png" />'],
    ['blob markup URL', '<video src="blob:koala"></video>'],
    ['data markup URL', '<img src="data:image/png;base64,AA==" />'],
    ['relative CSS URL', '<style>.koala { background: url(images/koala.png); }</style>'],
    ['protocol-relative CSS URL', '<style>.koala { background: url(//cdn.example.test/koala.png); }</style>'],
  ])('rejects %s', async (_label, source) => {
    const diagnostics = await svelteResolverPolicyDiagnostics(source)

    expect(diagnostics).toMatchObject([{ code: 'invalid_static_asset_url', severity: 'error' }])
  })

  it('does not constrain runtime-computed attributes', async () => {
    const diagnostics = await svelteResolverPolicyDiagnostics('<script>let imageUrl = dynamicUrl</script><img src={imageUrl} />')

    expect(diagnostics).toEqual([])
  })
})
