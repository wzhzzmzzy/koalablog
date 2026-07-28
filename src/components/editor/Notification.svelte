<script lang="ts">
  import { notifyStore } from './store.svelte';
</script>

{#if notifyStore.text}
  <div class="editor-notification" data-type={notifyStore.type} role={notifyStore.type === 'error' ? 'alert' : 'status'}>
    <span class="editor-notification__text">
      {notifyStore.text}
    </span>
  </div>
{/if}
