<script lang="ts">
  import type { CreationTemplateV1 } from '@/lib/files/types';
  import { CircleAlert } from '@lucide/svelte';

  interface Props {
    templates: CreationTemplateV1[];
    selectedIndex: number;
    invalidTemplateIndexes: Set<number>;
    onselect: (index: number) => void;
  }

  let { templates, selectedIndex, invalidTemplateIndexes, onselect }: Props = $props();
</script>

<aside class="min-w-0 border-b border-[--koala-border] bg-[--koala-input-bg] md:border-b-0 md:border-r" aria-label="Template Catalog">
  <div class="flex min-h-14 items-center justify-between gap-3 border-b border-[--koala-border-subtle] px-4">
    <h2 class="m-0 text-base">Catalog</h2>
    <span class="text-sm text-[--koala-subtext-0]">{templates.length}</span>
  </div>

  {#if templates.length === 0}
    <p class="m-0 p-4 text-sm leading-6 text-[--koala-subtext-0]">No templates. New Files use Blank Creation.</p>
  {:else}
    <ul class="m-0 max-h-52 list-none overflow-auto p-0 md:max-h-[38rem]">
      {#each templates as template, index}
        <li>
          <button
            type="button"
            class={`box-border flex min-h-15 w-full cursor-pointer items-center justify-between gap-3 border-0 border-l-[3px] px-3.5 py-2.5 text-left text-inherit hover:bg-[--koala-icon-btn-bg] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[--koala-link] focus-visible:outline-offset-1 ${selectedIndex === index ? 'border-l-[--koala-link] bg-[--koala-icon-btn-bg]' : 'border-l-transparent bg-transparent'}`}
            onclick={() => onselect(index)}
            aria-pressed={selectedIndex === index}
          >
            <span class="min-w-0">
              <strong class="block truncate font-normal">{template.prefix || 'Invalid Prefix'}</strong>
              <span class="block truncate text-xs text-[--koala-subtext-0]">{template.id || 'Missing ID'}</span>
            </span>
            {#if invalidTemplateIndexes.has(index)}
              <CircleAlert class="shrink-0 text-[--koala-error-text]" size={20} aria-label="Template has errors" />
            {/if}
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</aside>
