<script lang="ts">
  import { notifyStore } from './store.svelte';
</script>

{#if notifyStore.text}
  <div class="fixed top-20 right-8 z-[100] px-6 py-4 bg-[--koala-blockquote-bg] border-4 border-[--koala-text]">
    <span class="font-bold font-mono text-lg {notifyStore.type === 'error' ? 'text-[--koala-error-text]' : 'text-[--koala-text]'}">
      {notifyStore.text}
    </span>
  </div>
{/if}
