<script lang="ts">
import type { HeadingItem } from '@/lib/utils/heading-id';
import { onMount } from 'svelte';

interface Props {
  title: string;
  headings: HeadingItem[];
  siteTitle?: string;
}

const { headings }: Props = $props()

let isExpanded = $state(false);

function expandOutline() {
  isExpanded = true;
}

// Handle initial hash on page load
onMount(() => {
  const hash = window.location.hash;
  if (hash) {
    const id = hash.substring(1); // Remove the # prefix
    const element = document.getElementById(id);
    if (element) {
      // Small delay to ensure page is fully loaded
      setTimeout(() => {
        element.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }
});
</script>

{#if headings.length > 0}
  <hr class="my-4" />
  <nav class="flex flex-col gap-2">
    <!-- First heading always visible -->
    {#if headings[0]}
      <a
        href="#{headings[0].id}"
        class="text-lg font-normal underline"
        style="margin-left: {(headings[0].level - 1) * 1.5}rem;"
      >
        {headings[0].text}
      </a>
    {/if}

    <!-- Show expand button if there are more headings -->
    {#if headings.length > 1 && !isExpanded}
      <a 
        href="javascript:void(0)"
        class="text-lg font-normal"
        onclick={expandOutline}
        style="margin-left: 1.5rem"
      >...</a>
    {/if}

    <!-- Show remaining headings when expanded -->
    {#if isExpanded && headings.length > 1}
      <div class="w-full flex flex-col gap-2">
        {#each headings.slice(1) as heading}
          <a
            href="#{heading.id}"
            class="text-lg font-normal underline"
            style="margin-left: {(heading.level - 1) * 1.5}rem;"
          >
            {heading.text}
          </a>
        {/each}
      </div>
    {/if}
  </nav>
  <hr class="my-4" />
{/if}

