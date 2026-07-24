<script lang="ts">
  import { actions } from 'astro:actions'
  import { onMount } from 'svelte'

  type Maintenance = {
    active: boolean
    applicationCommit?: string
    startedAt?: string
    completedAt?: string
    lastAudit?: AuditSummary
  }

  type AuditSummary = {
    status: 'ready' | 'blocked'
    total: number
    active: number
    recycled: number
    current: number
    missing: number
    mismatched: number
    invalid: number
  }

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
    maintenance = result.data
    commit = maintenance.applicationCommit || commit
  }

  async function startMaintenance() {
    if (!commit || !window.confirm('Enable read-only maintenance mode before backfilling Source Hashes?'))
      return

    running = true
    error = ''
    message = ''
    const result = await actions.db.sourceHashMaintenance.start({ applicationCommit: commit })
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
    let afterId = 0

    while (true) {
      const result = await actions.db.sourceHashMaintenance.backfill({ afterId, batchSize: 100 })
      if (result.error) {
        error = describeError(result.error)
        break
      }
      latestBatch = result.data
      if (result.data.done) {
        message = `Backfill finished. Updated ${result.data.counts.updated} Source Hashes in the final batch; run audit next.`
        break
      }
      afterId = result.data.nextAfterId
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
      <input class="input font-mono" bind:value={commit} placeholder="e.g. 07def36d6a19" aria-describedby="source-hash-commit-help" />
      <span id="source-hash-commit-help" class="text-sm opacity-75">Required for the maintenance record. Deploy the compatible application after migration 0003 first.</span>
    </label>
  {:else}
    <p class="m-0 text-sm">Started {maintenance.startedAt || 'unknown time'} for commit <code>{maintenance.applicationCommit}</code>. File writes are blocked while this card is active.</p>
  {/if}

  {#if maintenance.lastAudit}
    <div class="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4" aria-label="Source Hash audit summary">
      <span>Total: {maintenance.lastAudit.total}</span>
      <span>Current: {maintenance.lastAudit.current}</span>
      <span>Missing: {maintenance.lastAudit.missing}</span>
      <span>Mismatched: {maintenance.lastAudit.mismatched}</span>
      <span>Invalid: {maintenance.lastAudit.invalid}</span>
      <span>Recycled: {maintenance.lastAudit.recycled}</span>
      <span class:font-bold={maintenance.lastAudit.status === 'ready'}>Audit: {maintenance.lastAudit.status}</span>
    </div>
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
      <button class="btn" type="button" disabled={running || !commit} onclick={startMaintenance}>Start maintenance</button>
    {:else}
      <button class="btn" type="button" disabled={running} onclick={runBackfill}>Run backfill</button>
      <button class="btn" type="button" disabled={running} onclick={runAudit}>Audit</button>
      <button class="btn" type="button" disabled={running} onclick={completeMaintenance}>Complete maintenance</button>
    {/if}
    <button class="btn" type="button" disabled={running || loading} onclick={refreshStatus}>Refresh status</button>
  </div>
</section>
