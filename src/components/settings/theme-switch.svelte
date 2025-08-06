<script lang="ts">
  import { CatppuccinTheme } from '@/lib/const/config'
    import { switchTheme } from '@/lib/utils/theme';
    import { onMount } from 'svelte';
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

    switchTheme(theme)
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
  <div class={{
    'text-[--koala-light-text]': !origin,
    'text-[--koala-active-bg] opacity-[0.3]': origin,
  }}>
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon icon-tabler icons-tabler-outline icon-tabler-sun"><path stroke="none" d="M0 0h24v24H0z" fill="none" /><path d="M12 12m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0" /><path d="M3 12h1m8 -9v1m8 8h1m-9 8v1m-6.4 -15.4l.7 .7m12.1 -.7l-.7 .7m0 11.4l.7 .7m-12.1 -.7l-.7 .7" /></svg>
  </div>
{/snippet}

{#snippet MoonStarsIcon(origin = false)}
  <div class={{
    'text-[--koala-dark-text]': !origin,
    'text-[--koala-active-bg] opacity-[0.3]': origin
  }}>
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon icon-tabler icons-tabler-outline icon-tabler-moon-stars"><path stroke="none" d="M0 0h24v24H0z" fill="none" /><path d="M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1 -8.313 -12.454z" /><path d="M17 4a2 2 0 0 0 2 2a2 2 0 0 0 -2 2a2 2 0 0 0 -2 -2a2 2 0 0 0 2 -2" /><path d="M19 11h2m-1 -1v2" /></svg>
  </div>
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
