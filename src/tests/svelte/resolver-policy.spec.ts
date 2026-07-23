import { svelteHttpsModuleSpecifiers, svelteResolverPolicyDiagnostics } from '@/workers/svelte/resolver-policy'
import { describe, expect, it } from 'vitest'

describe('svelte resolver policy', () => {
  it('allows public Svelte browser modules and absolute HTTPS modules', async () => {
    const diagnostics = await svelteResolverPolicyDiagnostics(`<script>
  import { writable } from 'svelte/store'
  import value from 'https://cdn.example.test/value.js'
  const later = import('https://cdn.example.test/later.js')
</script><p>{$writable ?? value ?? later}</p>`)

    expect(diagnostics).toEqual([])
  })

  it.each([
    ['other bare package', 'import value from \'lodash\'', 'unsupported_module_import'],
    ['relative module', 'import value from \'./value.js\'', 'relative_module_import'],
    ['alias module', 'import value from \'$lib/value\'', 'unsupported_module_import'],
    ['Svelte compiler', 'import value from \'svelte/compiler\'', 'svelte_internal_import'],
    ['Svelte server internals', 'import value from \'svelte/internal/server\'', 'svelte_internal_import'],
    ['non-absolute HTTPS module', 'import value from \'https:value\'', 'unsupported_module_import'],
    ['non-literal dynamic import', 'const value = import(moduleName)', 'non_literal_dynamic_import'],
  ])('rejects %s', async (_label, statement, code) => {
    const diagnostics = await svelteResolverPolicyDiagnostics(`<script>${statement}</script><p>ok</p>`)

    expect(diagnostics).toMatchObject([{ code, severity: 'error' }])
  })

  it('does not claim to constrain ordinary runtime fetch calls', async () => {
    const diagnostics = await svelteResolverPolicyDiagnostics(`<script>
  const response = fetch(dynamicUrl)
</script><p>{response}</p>`)

    expect(diagnostics).toEqual([])
  })

  it('extracts only literal absolute HTTPS entry modules for the dependency graph', async () => {
    const urls = await svelteHttpsModuleSpecifiers(`<script>
  import local from 'svelte/store'
  import remote from 'https://cdn.example.test/remote.js'
  const later = import('https://cdn.example.test/later.js')
</script><p>{local}{remote}{later}</p>`)

    expect(urls).toEqual([
      'https://cdn.example.test/later.js',
      'https://cdn.example.test/remote.js',
    ])
  })
})
