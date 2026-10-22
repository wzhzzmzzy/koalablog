<script lang="ts">
  import { onMount } from 'svelte'
  import { actions } from 'astro:actions'
  import { Button } from '@/components/ui/button'

  type Mode = 'd1' | 'r2'
  interface Entry {
    fileId: number
    path: string
    artifactHash: string
    mode: Mode
    deletedAt: Date | null
  }

  let files = $state<Entry[]>([])
  let target = $state<Mode>('r2')
  let ready = $state(false)
  let r2Available = $state(false)
  let busy = $state(false)
  let more = $state(false)
  let error = $state('')
  let outcomes = $state<Record<number, string>>({})

  async function load(append = false) {
    busy = true
    try {
      const afterId = append ? files.at(-1)?.fileId ?? 0 : 0
      const result = await actions.db.artifactStorage.list({ afterId })
      error = result.error?.message ?? ''
      if (result.data) {
        ready = result.data.ready
        r2Available = result.data.r2Available
        if (!r2Available)
          target = 'd1'
        files = append ? [...files, ...result.data.files] : result.data.files
        more = result.data.files.length === 50
        if (!append)
          outcomes = {}
      }
    }
    catch {
      error = 'Unable to load Artifact storage. Please refresh.'
    }
    finally {
      busy = false
    }
  }

  async function migrate(entries: Entry[]) {
    if (busy)
      return
    busy = true
    error = ''
    const destination = target
    try {
      for (const entry of entries) {
        if (entry.mode === destination)
          continue
        outcomes[entry.fileId] = 'Migrating…'
        const result = await actions.db.artifactStorage.transfer({ fileId: entry.fileId, artifactHash: entry.artifactHash, from: entry.mode, to: destination })
        if (result.error) {
          outcomes[entry.fileId] = result.error.message
          error = 'Migration stopped. Completed Files are preserved; refresh and retry the remaining Files.'
          break
        }
        entry.mode = destination
        outcomes[entry.fileId] = 'Verified and migrated'
      }
    }
    catch {
      error = 'Connection lost. Refresh storage to reconcile completed transfers before retrying.'
    }
    finally {
      busy = false
    }
  }

  onMount(() => { void load() })
</script>

<section class="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 lg:px-12 xl:px-16" aria-labelledby="artifact-storage-title">
  <h2 id="artifact-storage-title" class="text-xl font-semibold">Artifact storage</h2>
  <p class="mt-2 text-sm text-muted-foreground">Move already-deployed JavaScript and CSS between D1 and R2 without rebuilding. Source stays in the database. Only your Files are listed, including the recycle bin. Each transfer is verified before its storage pointer changes.</p>
  {#if r2Available}<p class="mt-2 text-sm text-muted-foreground">R2 must have no public bucket URL or bypass proxy. Private File access stays behind the checked application routes.</p>{/if}
  {#if error}<p role="alert" class="mt-4 text-destructive">{error}</p>{/if}
  <div class="my-4 flex flex-wrap items-center gap-3">
    <Button variant="outline" disabled={busy} onclick={() => void load()}>Refresh storage</Button>
    {#if ready}
      <label>Destination
        <select bind:value={target} disabled={busy} class="rounded-lg border border-input bg-background px-2 py-1 text-sm">
          <option value="d1">D1</option>
          <option value="r2" disabled={!r2Available}>R2</option>
        </select>
      </label>
      <Button disabled={busy || !files.some(entry => entry.mode !== target) || (target === 'r2' && !r2Available)} onclick={() => void migrate(files)}>Migrate loaded Files</Button>
    {/if}
  </div>
  {#if !ready && !busy && !error}
    <p>An administrator must run the database migration in <a href="/dashboard/settings" class="underline">Settings</a> first.</p>
  {:else if ready}
    {#if !r2Available}<p class="text-sm text-muted-foreground">R2 is unavailable: configure a private OSS bucket binding before choosing R2.</p>{/if}
    <ul class="m-0 list-none divide-y divide-border p-0" aria-label="Artifact storage Files">
      {#each files as entry (entry.fileId)}
        <li class="flex flex-wrap items-center gap-3 py-3">
          <span class="min-w-0 flex-1 break-all">{entry.path}{entry.deletedAt ? ' (recycled)' : ''}</span>
          <span class="text-sm">{entry.mode.toUpperCase()}</span>
          <span class="text-sm text-muted-foreground" role="status">{outcomes[entry.fileId] ?? ''}</span>
          <Button variant="outline" disabled={busy || entry.mode === target || (target === 'r2' && !r2Available)} onclick={() => void migrate([entry])}>Move to {target.toUpperCase()}</Button>
        </li>
      {/each}
    </ul>
    {#if files.length === 0}<p>No deployed Artifacts.</p>{/if}
    {#if more}<Button variant="outline" disabled={busy} onclick={() => void load(true)}>Load next 50</Button>{/if}
  {/if}
</section>
