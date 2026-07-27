<script lang="ts">
  import { Switch } from '@/components/ui/switch'

  interface Props {
    checked?: boolean
  }

  const { checked = false }: Props = $props()
  let enabled = $state(checked)
</script>

<div class="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/35 px-4 py-3">
  <div class="min-w-0">
    <p id="rss-enable-label" class="text-sm font-medium text-foreground">Enable RSS</p>
    <p id="rss-enable-description" class="mt-1 text-sm text-muted-foreground">Publish this site’s feed for readers.</p>
  </div>
  <Switch
    id="rss-enable-switch"
    aria-labelledby="rss-enable-label"
    aria-describedby="rss-enable-description"
    bind:checked={enabled}
  />
  <input class="sr-only" type="checkbox" name="rssEnable" bind:checked={enabled} tabindex="-1" aria-hidden="true" />
</div>
