<script lang="ts">
  import { CatppuccinTheme } from '@/lib/const/config'
  import { Themes } from '@/styles/theme'
  import { Check, Moon, Sun } from '@lucide/svelte'
  import { onMount } from 'svelte'
  import { Button } from '@/components/ui/button'

  interface Props {
    light?: CatppuccinTheme
    dark?: CatppuccinTheme
  }

  const ThemeOptions = {
    [CatppuccinTheme.Latte]: 'Latte',
    [CatppuccinTheme.Frappe]: 'Frappé',
    [CatppuccinTheme.Macchiato]: 'Macchiato',
    [CatppuccinTheme.Mocha]: 'Mocha',
  }

  const { light = CatppuccinTheme.Latte, dark = CatppuccinTheme.Mocha }: Props = $props()
  let lightTheme = $state(light)
  let darkTheme = $state(dark)
  let busEl: HTMLDivElement | null = null

  function themePreviewStyle(theme: CatppuccinTheme) {
    const palette = Themes[theme]
    return [
      `--theme-flavor-surface: ${palette['surface-0']}`,
      `--theme-flavor-hover: ${palette['surface-1']}`,
      `--theme-flavor-active: ${palette['surface-2']}`,
      `--theme-flavor-text: ${palette.text}`,
      `--theme-flavor-border: ${palette['surface-1']}`,
      `--theme-flavor-ring: ${palette.mauve}`,
    ].join('; ')
  }

  function dispatchTheme() {
    busEl?.dispatchEvent(new CustomEvent('update-theme', {
      bubbles: true,
      cancelable: true,
      detail: { light: lightTheme, dark: darkTheme },
    }))
  }

  function selectTheme(theme: CatppuccinTheme, type: 'light' | 'dark') {
    if (type === 'light') lightTheme = theme
    else darkTheme = theme
  }

  onMount(() => {
    busEl = document.querySelector('#theme-bus')
    dispatchTheme()
  })

  $effect(() => {
    lightTheme
    darkTheme
    dispatchTheme()
  })
</script>

<div class="grid gap-3 sm:grid-cols-2">
  <section class="rounded-lg border border-border bg-muted/35 p-3" aria-label="Light theme">
    <div class="mb-3 flex items-center gap-2 text-sm font-medium"><Sun class="size-4 text-[color:var(--koala-dashboard-warning)]" /> Light</div>
    <div class="grid grid-cols-2 gap-1">
      {#each Object.keys(ThemeOptions) as key}
        {@const theme = key as CatppuccinTheme}
        <Button variant="ghost" size="sm" class="theme-flavor-option justify-between" style={themePreviewStyle(theme)} aria-pressed={lightTheme === theme} onclick={() => selectTheme(theme, 'light')}>
          {ThemeOptions[theme]}
          {#if lightTheme === theme}<Check />{/if}
        </Button>
      {/each}
    </div>
  </section>
  <section class="rounded-lg border border-border bg-muted/35 p-3" aria-label="Dark theme">
    <div class="mb-3 flex items-center gap-2 text-sm font-medium"><Moon class="size-4 text-[color:var(--koala-dashboard-primary)]" /> Dark</div>
    <div class="grid grid-cols-2 gap-1">
      {#each Object.keys(ThemeOptions) as key}
        {@const theme = key as CatppuccinTheme}
        <Button variant="ghost" size="sm" class="theme-flavor-option justify-between" style={themePreviewStyle(theme)} aria-pressed={darkTheme === theme} onclick={() => selectTheme(theme, 'dark')}>
          {ThemeOptions[theme]}
          {#if darkTheme === theme}<Check />{/if}
        </Button>
      {/each}
    </div>
  </section>
</div>
