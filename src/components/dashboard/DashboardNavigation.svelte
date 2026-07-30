<script lang="ts">
  import {
    ExternalLink,
    FileText,
    HardDrive,
    Home,
    Menu,
    PenLine,
    RefreshCw,
    Settings,
  } from '@lucide/svelte'
  import { Button } from '@/components/ui/button'
  import * as Sheet from '@/components/ui/sheet'

  interface Props {
    activeRoute: string
    blogTitle: string
    origin: string
  }

  const { activeRoute, blogTitle, origin }: Props = $props()
  let mobileOpen = $state(false)

  const routes = [
    { id: 'home', label: 'Overview', href: '/dashboard', icon: Home },
    { id: 'edit', label: 'Editor', href: '/dashboard/edit', icon: PenLine },
    { id: 'oss', label: 'Storage', href: '/dashboard/oss', icon: HardDrive },
    { id: 'template', label: 'Templates', href: '/dashboard/template', icon: FileText },
    { id: 'rebuild', label: 'Deploy', href: '/dashboard/rebuild', icon: RefreshCw },
    { id: 'settings', label: 'Settings', href: '/dashboard/settings', icon: Settings },
  ]
</script>

{#snippet navigationLinks()}
  <nav class="grid gap-1" aria-label="Dashboard navigation">
    {#each routes as route}
      {@const Icon = route.icon}
      <a
        href={route.href}
        class={`flex h-9 items-center gap-3 rounded-lg px-3 text-sm text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground ${activeRoute === route.id ? 'bg-sidebar-accent font-medium text-sidebar-foreground' : ''}`}
        aria-current={activeRoute === route.id ? 'page' : undefined}
        onclick={() => mobileOpen = false}
      >
        <Icon class="size-4" />
        <span>{route.label}</span>
      </a>
    {/each}
  </nav>
{/snippet}

<aside class="fixed inset-y-0 left-0 z-40 hidden w-72 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
  <div class="flex h-16 items-center border-b border-sidebar-border px-6">
    <a href="/dashboard" class="min-w-0 text-sm font-semibold tracking-tight text-sidebar-foreground">
      <span class="block truncate">{blogTitle}</span>
      <span class="mt-0.5 block text-xs font-normal text-muted-foreground">Dashboard</span>
    </a>
  </div>

  <div class="flex flex-1 flex-col justify-between gap-8 px-3 py-5">
    {@render navigationLinks()}
    <a
      class="inline-flex items-center gap-2 px-3 text-xs text-muted-foreground transition-colors hover:text-foreground"
      href={origin}
      target="_blank"
      rel="noreferrer"
    >
      <ExternalLink class="size-3.5" />
      Open site
    </a>
  </div>
</aside>

<header class="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur lg:hidden">
  <a href="/dashboard" class="min-w-0 truncate text-sm font-semibold text-foreground">{blogTitle}</a>
  <Sheet.Root bind:open={mobileOpen}>
    <Sheet.Trigger>
      {#snippet child({ props })}
        <Button variant="outline" size="icon-sm" aria-label="Open navigation" {...props}>
          <Menu />
        </Button>
      {/snippet}
    </Sheet.Trigger>
    <Sheet.Content side="left" class="w-[17.5rem] gap-0 p-0">
      <Sheet.Header class="border-b border-border px-5 py-5">
        <Sheet.Title>{blogTitle}</Sheet.Title>
        <Sheet.Description>Dashboard navigation</Sheet.Description>
      </Sheet.Header>
      <div class="flex flex-1 flex-col justify-between gap-8 px-3 py-5">
        {@render navigationLinks()}
        <a
          class="inline-flex items-center gap-2 px-3 text-xs text-muted-foreground transition-colors hover:text-foreground"
          href={origin}
          target="_blank"
          rel="noreferrer"
        >
          <ExternalLink class="size-3.5" />
          Open site
        </a>
      </div>
    </Sheet.Content>
  </Sheet.Root>
</header>
