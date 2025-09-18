<script lang="ts">
import type { HeadingItem } from '@/lib/utils/heading-id';

interface Props {
  title: string;
  headings: HeadingItem[];
}

const { title, headings }: Props = $props()

function scrollToHeading(id: string) {
  const element = document.getElementById(id);
  if (element) {
    element.scrollIntoView({ behavior: 'smooth' });
  }
}
</script>

<nav class="md:fixed md:top-10 md:right-10 md:border-none">
  {#if headings.length > 0}
    <ul class="outline-list">
      {#each headings as heading}
        <li class="outline-item level-{heading.level}">
          <button
            type="button"
            class="outline-link"
            onclick={() => scrollToHeading(heading.id)}
          >
            {heading.text}
          </button>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="outline-empty">No headings found</p>
  {/if}
</nav>

<style lang="scss">
.outline-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.outline-item {
  margin: 0;

  &.level-1 { padding-left: 0; }
  &.level-2 { padding-left: 1rem; }
  &.level-3 { padding-left: 2rem; }
  &.level-4 { padding-left: 3rem; }
  &.level-5 { padding-left: 4rem; }
  &.level-6 { padding-left: 5rem; }
}

.outline-link {
  display: block;
  width: 100%;
  text-align: left;
  font-size: 0.9rem;
  background-color: transparent !important;
  line-height: 1.3;
  cursor: pointer;
  transition: all 0.2s ease;
}

.outline-list:hover {
  color: var(--koala-catppuccin-teal) !important;
}

.outline-empty {
  font-size: 0.9rem;
  margin: 0;
  font-style: italic;
}
</style>
