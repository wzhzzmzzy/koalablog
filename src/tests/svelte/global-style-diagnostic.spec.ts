import { globalStyleEscapeDiagnostics } from '@/workers/svelte/global-style-diagnostic'
import { describe, expect, it } from 'vitest'

describe('svelte global style diagnostics', () => {
  it('warns for unanchored explicit global selectors', async () => {
    const source = `<style>
  :global(body), :global(html), :global(:root), :global(body):hover { color: rebeccapurple; }
  @media (min-width: 1px) { :global(.page-shell) { color: rebeccapurple; } }
</style>
<p>Koala</p>`

    await expect(globalStyleEscapeDiagnostics(source)).resolves.toMatchObject([
      { code: 'global_style_escape', severity: 'warning' },
      { code: 'global_style_escape', severity: 'warning' },
      { code: 'global_style_escape', severity: 'warning' },
      { code: 'global_style_escape', severity: 'warning' },
      { code: 'global_style_escape', severity: 'warning' },
    ])
  })

  it('keeps component-local and Artifact-root-anchored global selectors executable without a warning', async () => {
    const source = `<style>
  .card :global(body) { color: rebeccapurple; }
  :global([data-koala-artifact-root]) h1 { color: rebeccapurple; }
</style>
<p>Koala</p>`

    await expect(globalStyleEscapeDiagnostics(source)).resolves.toEqual([])
  })
})
