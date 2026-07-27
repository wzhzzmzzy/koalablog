<script lang="ts">
import { actions } from "astro:actions";
import { Loader, Trash } from '@lucide/svelte'
import * as AlertDialog from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'

interface Props {
  key: string
}

const { key }: Props = $props()
let deleting = $state(false)
let error = $state<string | null>(null)

async function del() {
  deleting = true
  error = null
  const result = await actions.oss.remove([{ key }])
  if (result.error) {
    error = result.error.message
    deleting = false
    return
  }
  window.location.reload()
}
</script>

<AlertDialog.Root>
  <AlertDialog.Trigger>
    {#snippet child({ props })}
      <Button variant="ghost" size="icon-sm" aria-label={`Delete ${key}`} title="Delete file" {...props}>
        <Trash class="text-destructive" />
      </Button>
    {/snippet}
  </AlertDialog.Trigger>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>Delete this file?</AlertDialog.Title>
      <AlertDialog.Description class="break-all">This removes <code>{key}</code> from object storage. This action cannot be undone.</AlertDialog.Description>
    </AlertDialog.Header>
    {#if error}
      <p class="text-sm text-destructive" role="alert">{error}</p>
    {/if}
    <AlertDialog.Footer>
      <AlertDialog.Cancel disabled={deleting}>Cancel</AlertDialog.Cancel>
      <AlertDialog.Action variant="destructive" disabled={deleting} onclick={() => void del()}>
        {#if deleting}<Loader class="animate-spin" /> Deleting{:else}Delete{/if}
      </AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
