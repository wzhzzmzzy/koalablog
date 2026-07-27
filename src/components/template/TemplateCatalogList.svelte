<script lang="ts">
  import type { CreationTemplateV1 } from '@/lib/files/types'
  import { CircleAlert } from '@lucide/svelte'
  import { Badge } from '@/components/ui/badge'
  import { Button } from '@/components/ui/button'

  interface Props {
    templates: CreationTemplateV1[]
    selectedIndex: number
    invalidTemplateIndexes: Set<number>
    onselect: (index: number) => void
  }

  let { templates, selectedIndex, invalidTemplateIndexes, onselect }: Props = $props()
</script>

<aside class="min-w-0 border-b border-border bg-muted/35 md:border-r md:border-b-0" aria-label="Template Catalog">
  <div class="flex min-h-14 items-center justify-between gap-3 border-b border-border px-4">
    <h2 class="text-sm font-medium">Catalog</h2>
    <Badge variant="outline">{templates.length}</Badge>
  </div>

  {#if templates.length === 0}
    <p class="p-4 text-sm leading-6 text-muted-foreground">No templates. New Files use Blank Creation.</p>
  {:else}
    <ul class="m-0 max-h-52 list-none overflow-auto p-0 md:max-h-[38rem]">
      {#each templates as template, index}
        <li>
          <Button
            type="button"
            variant={selectedIndex === index ? 'secondary' : 'ghost'}
            class={`h-auto min-h-15 w-full justify-between rounded-none border-l-[3px] px-3.5 py-2.5 text-left ${selectedIndex === index ? 'border-l-primary' : 'border-l-transparent'}`}
            onclick={() => onselect(index)}
            aria-pressed={selectedIndex === index}
          >
            <span class="min-w-0">
              <strong class="block truncate font-normal">{template.prefix || 'Invalid Prefix'}</strong>
              <span class="mt-0.5 block truncate text-xs text-muted-foreground">{template.id || 'Missing ID'}</span>
            </span>
            {#if invalidTemplateIndexes.has(index)}
              <CircleAlert class="shrink-0 text-destructive" size={18} aria-label="Template has errors" />
            {/if}
          </Button>
        </li>
      {/each}
    </ul>
  {/if}
</aside>
