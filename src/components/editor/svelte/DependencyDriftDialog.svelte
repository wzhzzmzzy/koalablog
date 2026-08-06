<script lang="ts">
  import type { DependencyDiff } from '@/lib/svelte/dependency-diff'
  import { onMount, tick } from 'svelte'

  interface Props {
    currentArtifactHash: string
    diff: DependencyDiff
    proposedArtifactHash: string
    onApprove: () => void
    onCancel: () => void
  }

  let { currentArtifactHash, diff, proposedArtifactHash, onApprove, onCancel }: Props = $props()
  let dialog: HTMLDialogElement | undefined = $state()
  let cancelButton: HTMLButtonElement | undefined = $state()

  function cancel() {
    dialog?.close()
    onCancel()
  }

  function approve() {
    dialog?.close()
    onApprove()
  }

  onMount(() => {
    dialog?.showModal()
    void tick().then(() => cancelButton?.focus())
    return () => {
      if (dialog?.open)
        dialog.close()
    }
  })
</script>

<dialog
  bind:this={dialog}
  class="editor-modal editor-dependency-drift-dialog"
  aria-labelledby="dependency-drift-title"
  aria-describedby="dependency-drift-description"
  oncancel={(event) => { event.preventDefault(); cancel(); }}
  onclick={(event) => { if (event.target === dialog) cancel(); }}
>
    <h2 id="dependency-drift-title" class="m-0 text-lg">Review Svelte dependency changes</h2>
    <p id="dependency-drift-description" class="mt-2 text-sm">Replacing this Artifact changes its pinned browser dependencies. Confirm only after reviewing each entry.</p>
    <dl class="mt-3 break-all text-xs">
      <dt>Current Artifact Hash</dt><dd class="m-0">{currentArtifactHash}</dd>
      <dt class="mt-2">Proposed Artifact Hash</dt><dd class="m-0">{proposedArtifactHash}</dd>
    </dl>
    <ul class="mt-4 max-h-60 overflow-y-auto rounded border p-3 text-sm">
      {#each diff.changes as change}
        <li class="mb-3 last:mb-0">
          <strong>{change.kind}</strong> {change.url}
          {#if change.previous}<div>previous: {change.previous.sha256} ({change.previous.bytes} bytes)</div>{/if}
          {#if change.proposed}<div>proposed: {change.proposed.sha256} ({change.proposed.bytes} bytes)</div>{/if}
        </li>
      {/each}
    </ul>
    {#if diff.truncated}<p class="text-sm text-[color:var(--koala-warning-text)]">Additional dependency changes are omitted from this bounded review.</p>{/if}
    <div class="mt-5 flex justify-end gap-2">
      <button bind:this={cancelButton} type="button" class="btn" onclick={cancel}>Cancel</button>
      <button type="button" class="btn" onclick={approve}>Approve replacement</button>
    </div>
</dialog>
