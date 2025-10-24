<script lang="ts">
  import { CatppuccinTheme } from '@/lib/const/config'
  import { onMount } from 'svelte';
  import { Sun, Moon } from '@lucide/svelte'

  interface Props {
    light?: CatppuccinTheme
    dark?: CatppuccinTheme
	}

  const ThemeOptions = {
    [CatppuccinTheme.Latte]: 'Latte',
    [CatppuccinTheme.Frappe]: 'Frappé',
    [CatppuccinTheme.Macchiato]: 'Macchiato',
    [CatppuccinTheme.Mocha]: 'Mocha'
  }

  const { light = CatppuccinTheme.Latte, dark = CatppuccinTheme.Mocha }: Props = $props()

  let lightTheme = $state(light)
  let darkTheme = $state(dark)

  function handleChangeTheme(event: Event) {
    const theme = (event.target as HTMLDivElement).dataset.theme as CatppuccinTheme
    const themeType = (event.target as HTMLDivElement).dataset.type as 'light' | 'dark'

    if (themeType === 'light') {
      lightTheme = theme
    } else {
      darkTheme = theme
    }
  }

  let busEl: HTMLDivElement | null = null
  onMount(() => {
    busEl = document.querySelector('#theme-bus')
  })

  $effect(() => {
    busEl?.dispatchEvent(new CustomEvent('update-theme', {
      bubbles: true,
      cancelable: true,
      detail: {
        light: lightTheme,
        dark: darkTheme
      }
    }))
  })
</script>

{#snippet SunIcon(origin = false)}
  <Sun class={{
    'text-[--koala-light-text]': !origin,
    'text-[--koala-active-bg] opacity-[0.3]': origin,
  }} />
{/snippet}

{#snippet MoonStarsIcon(origin = false)}
  <Moon class={{
    'text-[--koala-dark-text]': !origin,
    'text-[--koala-active-bg] opacity-[0.3]': origin
  }} />
{/snippet}

<div class="flex flex-col bg-[--koala-button-bg] text-[--koala-button-text] w-50">
  {#each Object.keys(ThemeOptions) as key}
    <div class="flex justify-between items-center h-10">
      <div 
        role="button"
        tabindex="0"
        data-theme={key}
        data-type="light"
        class="h-full shrink-0 w-12 flex justify-center items-center hover:bg-[--koala-button-hover-bg]"
        onkeydown={handleChangeTheme}
        onclick={handleChangeTheme}
      >
      {#if key === lightTheme || key === light}
        {@render SunIcon(!(key === lightTheme) && key === light)}
      {/if}
      </div>
      <div>{ThemeOptions[key as keyof typeof ThemeOptions]}</div>
      <div 
        role="button"
        tabindex="0"
        data-theme={key}
        data-type="dark"
        class="h-full shrink-0 w-12 flex justify-center items-center hover:bg-[--koala-button-hover-bg]"
        onkeydown={handleChangeTheme}
        onclick={handleChangeTheme}
      >
      {#if key === darkTheme || key === dark}
        {@render MoonStarsIcon(!(key === darkTheme) && key === dark)}
      {/if}
      </div>
    </div>
  {/each}
</div>
