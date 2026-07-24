<script lang="ts">
  import type { DependencyDiff } from '@/lib/svelte/dependency-diff'

  interface Props {
    currentArtifactHash: string
    diff: DependencyDiff
    proposedArtifactHash: string
    onApprove: () => void
    onCancel: () => void
  }

  let { currentArtifactHash, diff, proposedArtifactHash, onApprove, onCancel }: Props = $props()
</script>

<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="presentation">
  <section class="w-full max-w-2xl rounded bg-[--koala-bg] p-5 shadow-xl" role="dialog" aria-modal="true" aria-labelledby="dependency-drift-title">
    <h2 id="dependency-drift-title" class="m-0 text-lg">Review Svelte dependency changes</h2>
    <p class="mt-2 text-sm">Replacing this Artifact changes its pinned browser dependencies. Confirm only after reviewing each entry.</p>
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
    {#if diff.truncated}<p class="text-sm text-[--koala-warning-text]">Additional dependency changes are omitted from this bounded review.</p>{/if}
    <div class="mt-5 flex justify-end gap-2">
      <button type="button" class="btn" onclick={onCancel}>Cancel</button>
      <button type="button" class="btn" onclick={onApprove}>Approve replacement</button>
    </div>
  </section>
</div>
