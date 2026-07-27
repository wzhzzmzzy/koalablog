<script lang="ts">
  import { FileText, HardDrive, RefreshCw, Settings } from '@lucide/svelte'
  import { Button } from '@/components/ui/button'

  interface Props {
    blogTitle: string
  }

  const { blogTitle }: Props = $props()
  const links = [
    { href: '/dashboard/oss', label: 'Storage', icon: HardDrive },
    { href: '/dashboard/template', label: 'Templates', icon: FileText },
    { href: '/dashboard/rebuild', label: 'Rebuild', icon: RefreshCw },
    { href: '/dashboard/settings', label: 'Settings', icon: Settings },
  ]
</script>

<section class="flex min-h-[calc(100svh-3.5rem)] items-center px-5 py-16 sm:px-10 lg:min-h-screen lg:px-16 xl:px-24" aria-labelledby="dashboard-title">
  <div class="w-full max-w-5xl">
    <p class="mb-5 text-sm font-medium tracking-wide text-muted-foreground">{blogTitle}</p>
    <h1 id="dashboard-title" class="max-w-5xl text-5xl font-semibold tracking-[-0.045em] text-foreground sm:text-7xl">Dashboard</h1>
    <p class="mt-6 max-w-xl text-base text-muted-foreground sm:text-lg">A quiet place for the tools that keep your workspace running.</p>

    <nav class="mt-10 flex flex-wrap gap-2" aria-label="Dashboard tools">
      {#each links as link}
        {@const Icon = link.icon}
        <Button href={link.href} variant="outline" size="sm" class="group">
          <Icon class="text-muted-foreground transition-transform duration-150 motion-reduce:transition-none group-hover:translate-x-0.5" />
          {link.label}
        </Button>
      {/each}
    </nav>
  </div>
</section>
