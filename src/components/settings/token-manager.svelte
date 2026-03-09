<script lang="ts">
  import { actions } from 'astro:actions';
  import { Copy, RefreshCw, Eye, EyeOff, Check, Trash2 } from '@lucide/svelte';

  let { initialToken = '' } = $props();

  let token = $state(initialToken);
  let showToken = $state(false);
  let copied = $state(false);
  let loading = $state(false);

  async function generateToken() {
    if (token && !confirm('Are you sure you want to regenerate the token? The old one will be invalidated.')) {
      return;
    }

    loading = true;
    try {
      const result = await actions.db.auth.generateBearerToken();
      if (result.data) {
        token = result.data.token;
        showToken = true;
      } else if (result.error) {
        alert('Failed to generate token: ' + result.error.message);
      }
    } catch (e) {
      alert('An unexpected error occurred');
    } finally {
      loading = false;
    }
  }

  async function revokeToken() {
    if (!token) return;
    if (!confirm('Are you sure you want to revoke the token? All API clients using this token will stop working.')) {
      return;
    }

    loading = true;
    try {
      const result = await actions.db.auth.revokeBearerToken();
      if (result.data) {
        token = '';
        showToken = false;
      } else if (result.error) {
        alert('Failed to revoke token: ' + result.error.message);
      }
    } catch (e) {
      alert('An unexpected error occurred');
    } finally {
      loading = false;
    }
  }

  async function copyToClipboard() {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
      copied = true;
      setTimeout(() => {
        copied = false;
      }, 2000);
    } catch (e) {
      alert('Failed to copy to clipboard');
    }
  }
</script>

<div class="token-manager flex flex-col gap-2 mt-4">
  <label for="bearer-token">Bearer Token</label>
  <div class="flex items-center gap-2">
    <div class="relative flex-1">
      <input
        id="bearer-token"
        type={showToken ? 'text' : 'password'}
        class="input w-full pr-10"
        value={token}
        readonly
        placeholder="No token generated"
      />
      {#if token}
        <button
          type="button"
          class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
          onclick={() => showToken = !showToken}
          title={showToken ? 'Hide token' : 'Show token'}
        >
          {#if showToken}
            <EyeOff size={20} />
          {:else}
            <Eye size={20} />
          {/if}
        </button>
      {/if}
    </div>
    
    <button
      type="button"
      class="btn p-2"
      onclick={copyToClipboard}
      disabled={!token}
      title="Copy to clipboard"
    >
      {#if copied}
        <Check size={20} class="text-green-500" />
      {:else}
        <Copy size={20} />
      {/if}
    </button>

    <button
      type="button"
      class="btn p-2"
      onclick={generateToken}
      disabled={loading}
      title={token ? 'Regenerate token' : 'Generate token'}
    >
      <RefreshCw size={20} class={loading ? 'animate-spin' : ''} />
    </button>

    <button
      type="button"
      class="btn p-2"
      onclick={revokeToken}
      disabled={loading || !token}
      title="Revoke token"
    >
      <Trash2 size={20} class="text-red-500" />
    </button>
  </div>
  <p class="text-xs opacity-60">
    Use this token for API authentication: <code>Authorization: Bearer &lt;token&gt;</code>
  </p>
</div>

<style>
  .token-manager {
    max-width: 480px;
  }
</style>
