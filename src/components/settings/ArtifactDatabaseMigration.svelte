<script lang="ts">
  import { onMount } from 'svelte'
  import { actions } from 'astro:actions'
  import { Button } from '@/components/ui/button'

  let status = $state<{ ready: boolean, snapshots: number, snapshotBytes: number } | null>(null)
  let confirmed = $state(false)
  let busy = $state(false)
  let error = $state('')

  async function inspect() {
    busy = true
    try {
      const result = await actions.db.artifactStorage.schemaStatus()
      error = result.error?.message ?? ''
      status = result.data ?? null
    }
    catch {
      error = 'Unable to check the database. Please retry.'
    }
    finally {
      busy = false
    }
  }

  async function migrate() {
    if (!confirmed || busy)
      return
    busy = true
    try {
      const result = await actions.db.artifactStorage.migrateSchema({ backupConfirmed: true, removeSnapshots: true })
      error = result.error?.message ?? ''
      status = result.data ?? status
    }
    catch {
      error = 'Connection lost. Check migration status before retrying.'
    }
    finally {
      busy = false
    }
  }

  onMount(() => { void inspect() })
</script>

<section class="settings-section" aria-labelledby="artifact-database-title">
  <div class="settings-section-grid">
    <header class="settings-section-heading">
      <h2 id="artifact-database-title">Svelte database migration</h2>
      <p>Remove obsolete snapshots and enable D1 / R2 Artifact storage. File Source, permissions and revisions are unchanged.</p>
    </header>
    <div class="settings-section-content space-y-4">
      {#if error}<p role="alert" class="text-destructive">{error}</p>{/if}
      {#if status?.ready}
        <p role="status">Database is up to date. Stored snapshots have been removed.</p>
        <a href="/dashboard/rebuild" class="underline">Manage Artifact storage in Deploy</a>
      {:else if status}
        <p>{status.snapshots} stored snapshots · {status.snapshotBytes.toLocaleString()} bytes to remove.</p>
        <p>Export a recoverable database backup first. This migration permanently drops the snapshot column, including recycled Files. Existing JavaScript and CSS stay in D1 until you migrate them in Deploy.</p>
        <label class="flex items-start gap-2">
          <input type="checkbox" bind:checked={confirmed} disabled={busy} />
          <span>I have a recoverable backup and confirm removal of all stored Svelte snapshots.</span>
        </label>
        <Button type="button" disabled={busy || !confirmed} onclick={() => void migrate()}>Migrate database and remove snapshots</Button>
      {:else if busy}
        <p role="status">Checking database…</p>
      {/if}
      <Button variant="outline" type="button" disabled={busy} onclick={() => void inspect()}>Check migration status</Button>
    </div>
  </div>
</section>
