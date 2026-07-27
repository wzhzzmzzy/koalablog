<script lang="ts">
  import { Check, Copy, RefreshCw } from '@lucide/svelte'
  import * as AlertDialog from '@/components/ui/alert-dialog'
  import { Button } from '@/components/ui/button'
  import { Input } from '@/components/ui/input'

  interface Props {
    bearerToken: string
  }

  const { bearerToken }: Props = $props()
  let copied = $state(false)

  function fallbackCopy(value: string) {
    const textarea = document.createElement('textarea')
    textarea.value = value
    textarea.style.position = 'fixed'
    textarea.style.clip = 'rect(0 0 0 0)'
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
  }

  async function copyToken() {
    if (!bearerToken) return
    try {
      await navigator.clipboard.writeText(bearerToken)
    }
    catch {
      fallbackCopy(bearerToken)
    }
    copied = true
    setTimeout(() => copied = false, 1500)
  }

  function regenerate() {
    const hiddenInput = document.querySelector<HTMLInputElement>('#regenerate-bearer-token')
    const form = document.querySelector<HTMLFormElement>('#settings-form')
    if (!hiddenInput || !form) return
    hiddenInput.value = 'true'
    form.requestSubmit()
  }
</script>

<div class="flex flex-col gap-2 sm:flex-row sm:items-center">
  <Input id="bearer-token-input" class="font-mono text-xs sm:max-w-md" value={bearerToken || 'Not generated'} readonly />
  <div class="flex items-center gap-2">
    <Button id="copy-bearer-token-btn" type="button" variant="outline" size="icon-sm" disabled={!bearerToken || copied} onclick={copyToken} aria-label="Copy bearer token" title="Copy bearer token">
      {#if copied}<Check />{:else}<Copy />{/if}
    </Button>
    <AlertDialog.Root>
      <AlertDialog.Trigger>
        {#snippet child({ props })}
          <Button id="regenerate-bearer-token-btn" type="button" variant="outline" size="sm" {...props}>
            <RefreshCw />
            {bearerToken ? 'Refresh' : 'Generate'}
          </Button>
        {/snippet}
      </AlertDialog.Trigger>
      <AlertDialog.Content>
        <AlertDialog.Header>
          <AlertDialog.Title>{bearerToken ? 'Refresh bearer token?' : 'Generate bearer token?'}</AlertDialog.Title>
          <AlertDialog.Description>
            {bearerToken ? 'The existing token will stop working after the settings are saved.' : 'A new token will be generated and shown after the settings are saved.'}
          </AlertDialog.Description>
        </AlertDialog.Header>
        <AlertDialog.Footer>
          <AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
          <AlertDialog.Action onclick={regenerate}>Continue</AlertDialog.Action>
        </AlertDialog.Footer>
      </AlertDialog.Content>
    </AlertDialog.Root>
  </div>
</div>
