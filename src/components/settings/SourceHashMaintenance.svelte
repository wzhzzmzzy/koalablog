<script lang="ts">
  import { actions } from 'astro:actions'
  import type { SourceHashBackfillMaintenance } from '@/lib/kv'
  import { onMount } from 'svelte'

  type Maintenance = SourceHashBackfillMaintenance

  type BackfillBatch = {
    done: boolean
    nextAfterId: number
    counts: {
      processed: number
      updated: number
      skipped: number
      invalid: number
      retried: number
    }
  }

  let maintenance = $state<Maintenance>({ active: false })
  let commit = $state('')
  let operator = $state('')
  let sourceHashSchemaReady = $state(false)
  let message = $state('')
  let error = $state('')
  let loading = $state(true)
  let running = $state(false)
  let latestBatch = $state<BackfillBatch | null>(null)

  function describeError(value: { message?: string } | undefined): string {
    return value?.message || 'Migration operation failed'
  }

  async function refreshStatus() {
    loading = true
    error = ''
    const result = await actions.db.sourceHashMaintenance.status({})
    loading = false
    if (result.error) {
      error = describeError(result.error)
      return
    }
    maintenance = result.data.maintenance
    sourceHashSchemaReady = result.data.sourceHashSchemaReady
    commit = maintenance.applicationCommit || commit
  }

  async function startMaintenance() {
    if (!commit || !operator || !window.confirm('Enable read-only maintenance mode before backfilling Source Hashes?'))
      return

    running = true
    error = ''
    message = ''
    const result = await actions.db.sourceHashMaintenance.start({ applicationCommit: commit, operator })
    running = false
    if (result.error) {
      error = describeError(result.error)
      return
    }
    maintenance = result.data.maintenance
    message = result.data.templateCatalog.status === 'upgraded'
      ? 'Maintenance is active. The Template Catalog was upgraded before backfill.'
      : 'Maintenance is active. File writes are now blocked.'
  }

  async function runBackfill() {
    running = true
    error = ''
    message = ''
    latestBatch = null
    let afterId = maintenance.progress?.afterId || 0

    while (true) {
      const result = await actions.db.sourceHashMaintenance.backfill({ afterId, batchSize: 100 })
      if (result.error) {
        error = describeError(result.error)
        break
      }
      latestBatch = result.data.batch
      maintenance = result.data.maintenance
      if (result.data.batch.done) {
        message = `Backfill finished. Updated ${maintenance.progress?.updated || 0} Source Hashes; run audit next.`
        break
      }
      afterId = result.data.batch.nextAfterId
    }
    running = false
  }

  async function runAudit() {
    running = true
    error = ''
    message = ''
    const result = await actions.db.sourceHashMaintenance.audit({ batchSize: 100 })
    running = false
    if (result.error) {
      error = describeError(result.error)
      return
    }
    maintenance = { ...maintenance, lastAudit: { status: result.data.status, ...result.data.summary } }
    message = result.data.status === 'ready'
      ? 'Audit passed. You can close maintenance mode, then proceed to migration 0004.'
      : 'Audit found unresolved Source Hashes. Do not run migration 0004.'
  }

  async function completeMaintenance() {
    if (!window.confirm('Close maintenance mode? This is allowed only when the server audit passes.'))
      return

    running = true
    error = ''
    message = ''
    const result = await actions.db.sourceHashMaintenance.complete({})
    running = false
    if (result.error) {
      error = describeError(result.error)
      return
    }
    maintenance = {
      ...maintenance,
      active: false,
      completedAt: new Date().toISOString(),
      lastAudit: { status: result.data.status, ...result.data.summary },
    }
    message = 'Maintenance is closed. The database is ready for migration 0004.'
  }

  onMount(refreshStatus)
</script>

<section class="flex flex-col gap-3 rounded border border-[var(--koala-overlay-0)] p-4" aria-labelledby="source-hash-maintenance-title">
  <div class="flex flex-wrap items-center justify-between gap-2">
    <div>
      <h3 id="source-hash-maintenance-title" class="m-0">Phase 3 Source Hash migration</h3>
      <p class="m-0 text-sm opacity-75">Backfill historic Files in safe batches before applying migration 0004.</p>
    </div>
    <span class="rounded px-2 py-1 text-sm" style={`background-color: ${maintenance.active ? 'var(--koala-yellow)' : 'var(--koala-green)'}`}>
      {maintenance.active ? 'Maintenance active' : 'Writes available'}
    </span>
  </div>

  {#if loading}
    <p class="m-0 text-sm">Loading migration status…</p>
  {:else if !maintenance.active}
    <label class="flex max-w-xl flex-col gap-1">
      <span>Compatible deployed Git commit</span>
      <input class="input font-mono" bind:value={commit} placeholder="Exact deployed Git SHA" aria-describedby="source-hash-commit-help" />
      <span id="source-hash-commit-help" class="text-sm opacity-75">Must exactly match the deployed application marker. Deploy the compatible application after migration 0003 first.</span>
      <span>Operator</span>
      <input class="input" bind:value={operator} placeholder="Your name" />
      <span class="text-sm opacity-75">Schema migration 0003: {sourceHashSchemaReady ? 'ready' : 'not detected — do not start maintenance.'}</span>
    </label>
  {:else}
    <p class="m-0 text-sm">Started {maintenance.startedAt || 'unknown time'} by {maintenance.operator || 'unknown operator'} for commit <code>{maintenance.applicationCommit}</code>. File writes are blocked while this card is active.</p>
  {/if}

  {#if maintenance.lastAudit}
    <dl class="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
      <div><dt class="inline">Total: </dt><dd class="inline">{maintenance.lastAudit.total}</dd></div>
      <div><dt class="inline">Current: </dt><dd class="inline">{maintenance.lastAudit.current}</dd></div>
      <div><dt class="inline">Missing: </dt><dd class="inline">{maintenance.lastAudit.missing}</dd></div>
      <div><dt class="inline">Mismatched: </dt><dd class="inline">{maintenance.lastAudit.mismatched}</dd></div>
      <div><dt class="inline">Invalid: </dt><dd class="inline">{maintenance.lastAudit.invalid}</dd></div>
      <div><dt class="inline">Recycled: </dt><dd class="inline">{maintenance.lastAudit.recycled}</dd></div>
      <div class:font-bold={maintenance.lastAudit.status === 'ready'}><dt class="inline">Audit: </dt><dd class="inline">{maintenance.lastAudit.status}</dd></div>
    </dl>
  {/if}

  {#if maintenance.progress}
    <p class="m-0 text-sm">Backfill progress: {maintenance.progress.batches} batches, {maintenance.progress.processed} processed, {maintenance.progress.updated} updated, {maintenance.progress.invalid} invalid. {maintenance.progress.done ? 'All currently missing rows were processed.' : `Resume cursor: ${maintenance.progress.afterId}.`}</p>
  {/if}

  {#if latestBatch}
    <p class="m-0 text-sm">Last batch: processed {latestBatch.counts.processed}, updated {latestBatch.counts.updated}, skipped {latestBatch.counts.skipped}, invalid {latestBatch.counts.invalid}.</p>
  {/if}

  {#if error}
    <p class="m-0 text-sm text-[var(--koala-red)]" role="alert">{error}</p>
  {/if}
  {#if message}
    <p class="m-0 text-sm text-[var(--koala-green)]" role="status">{message}</p>
  {/if}

  <div class="flex flex-wrap gap-2">
    {#if !maintenance.active}
      <button class="btn" type="button" disabled={running || !sourceHashSchemaReady || !commit || !operator} onclick={startMaintenance}>Start maintenance</button>
      <button class="btn" type="button" disabled={running || !sourceHashSchemaReady} onclick={runAudit}>Check readiness</button>
    {:else}
      <button class="btn" type="button" disabled={running} onclick={runBackfill}>Run backfill</button>
      <button class="btn" type="button" disabled={running} onclick={runAudit}>Audit</button>
      <button class="btn" type="button" disabled={running} onclick={completeMaintenance}>Complete maintenance</button>
    {/if}
    <button class="btn" type="button" disabled={running || loading} onclick={refreshStatus}>Refresh status</button>
  </div>
</section>
