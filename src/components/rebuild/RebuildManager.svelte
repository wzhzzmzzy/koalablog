<script lang="ts">
  import type { SvelteBuildController } from '@/components/editor/svelte/build-controller.svelte'
  import { onMount } from 'svelte'
  import { actions } from 'astro:actions'
  import { Button } from '@/components/ui/button'
  import { SVELTE_TOOLCHAIN_VERSIONS, UNOCSS_CONFIG_HASH } from '@/lib/svelte/toolchain'
  import { completeRebuild, createRebuildState, rebuildCandidates, rebuildProgress, retryFailedRebuild, startRebuild, type RebuildEntry } from './rebuild-model'

  type Mode = 'd1' | 'r2'
  type Entry = NonNullable<Awaited<ReturnType<typeof actions.db.artifactStorage.list>>['data']>['files'][number]

  let files = $state<Entry[]>([])
  let rebuildState = $state(createRebuildState([]))
  let ready = $state(false)
  let r2Available = $state(false)
  let canConfigure = $state(false)
  let defaultStorage = $state<Mode>('d1')
  let selectedStorage = $state<Mode>('d1')
  let loading = $state(true)
  let saving = $state(false)
  let running = $state(false)
  let migrating = $state<number | null>(null)
  let more = $state(false)
  let error = $state('')
  let notice = $state('')
  let outcomes = $state<Record<number, string>>({})
  let stopRequested = $state(false)
  let disposed = false
  let controller: SvelteBuildController | null = null
  const busy = $derived(loading || saving || running || migrating !== null)
  const progress = $derived(rebuildProgress(rebuildState))

  onMount(() => {
    void load()
    return () => {
      disposed = true
      controller?.dispose()
    }
  })

  async function load(append = false) {
    loading = true
    error = ''
    try {
      const result = await actions.db.artifactStorage.list({ afterId: append ? files.at(-1)?.fileId ?? 0 : 0 })
      if (result.error) throw new Error(result.error.message)
      const data = result.data!
      ready = data.ready
      r2Available = data.r2Available
      canConfigure = data.canConfigure
      defaultStorage = selectedStorage = data.defaultStorage
      files = append ? [...files, ...data.files] : data.files
      more = data.files.length === 50
      const previous = append ? rebuildState.entries : []
      rebuildState = createRebuildState(rebuildCandidates(files))
      rebuildState.entries = rebuildState.entries.map(entry => previous.find(candidate => candidate.id === entry.id) ?? entry)
      if (!append) outcomes = {}
    }
    catch (caught) {
      ready = canConfigure = false
      error = caught instanceof Error ? caught.message : 'Unable to load pages. Please retry.'
    }
    finally { loading = false }
  }

  async function saveDefault() {
    saving = true
    notice = error = ''
    try {
      const result = await actions.db.artifactStorage.setDefault({ storage: selectedStorage })
      if (result.error) throw new Error(result.error.message)
      defaultStorage = result.data!.storage
      notice = 'Default saved. Existing deployments keep their current storage mode.'
    }
    catch (caught) {
      error = caught instanceof Error ? caught.message : 'Unable to save the default. Please retry.'
    }
    finally { saving = false }
  }

  async function refreshEntry(fileId: number) {
    const result = await actions.db.artifactStorage.list({ afterId: 0, fileId })
    if (result.error) throw new Error(result.error.message)
    const current = result.data?.files[0]
    files = current ? files.map(entry => entry.fileId === fileId ? current : entry) : files.filter(entry => entry.fileId !== fileId)
  }

  async function migrate(entry: Entry) {
    if (busy || !entry.artifactHash || !entry.mode) return
    migrating = entry.fileId
    outcomes[entry.fileId] = 'Migrating…'
    try {
      const result = await actions.db.artifactStorage.transfer({
        fileId: entry.fileId, artifactHash: entry.artifactHash,
        from: entry.mode, to: entry.mode === 'd1' ? 'r2' : 'd1',
      })
      if (result.error) throw new Error(result.error.message)
      await refreshEntry(entry.fileId)
      outcomes[entry.fileId] = 'Storage migrated. Source and deployment are unchanged.'
    }
    catch (caught) {
      outcomes[entry.fileId] = `${caught instanceof Error ? caught.message : 'Connection lost.'} Refresh to check the current state before retrying.`
    }
    finally { migrating = null }
  }

  async function deploy(candidate: RebuildEntry) {
    const source = await actions.db.editor.file({ id: candidate.id })
    if (source.error) throw new Error(source.error.message)
    const file = source.data
    if (!file || file.deletedAt || file.renderer !== 'svelte' || file.sourceHash !== candidate.sourceHash)
      throw new Error('Source changed or is unavailable. Refresh before deploying.')
    const { SvelteBuildController } = await import('@/components/editor/svelte/build-controller.svelte')
    if (disposed) return
    controller = new SvelteBuildController()
    try {
      await controller.saved({ enabled: true, fileId: file.id, renderer: 'svelte', source: file.content, sourceHash: file.sourceHash })
      for (let attempt = 0; attempt < 2400; attempt += 1) {
        if (disposed) return
        const build = controller.build
        if (build?.type === 'build-error') throw new Error(build.error.message)
        if (build?.type === 'build-success') {
          const result = await actions.db.renderArtifact.attach({
            fileId: file.id, schemaVersion: 2, renderer: 'svelte',
            svelteVersion: SVELTE_TOOLCHAIN_VERSIONS.svelte,
            unocssVersion: SVELTE_TOOLCHAIN_VERSIONS.unocss, unocssConfigHash: UNOCSS_CONFIG_HASH,
            sourceHash: file.sourceHash, dependencies: build.dependencies, javascript: build.javascript, css: build.css,
          })
          if (result.error) {
            let code = ''
            try { code = JSON.parse(result.error.message).code } catch {}
            if (code === 'dependency_changed') {
              rebuildState = completeRebuild(rebuildState, candidate.id, 'dependency_changed', 'Dependencies changed. Review in the editor. This utility never confirms it.')
              return
            }
            throw new Error(result.error.message)
          }
          await refreshEntry(file.id)
          rebuildState = completeRebuild(rebuildState, candidate.id, 'success')
          return
        }
        await new Promise(resolve => setTimeout(resolve, 50))
      }
      throw new Error('Svelte Artifact build timed out')
    }
    finally {
      controller?.dispose()
      controller = null
    }
  }

  async function startBatch(fileId?: number) {
    if (busy || !ready) return
    if (fileId !== undefined) rebuildState = retryFailedRebuild(rebuildState, fileId)
    running = true
    stopRequested = false
    try {
      while (!disposed && !stopRequested) {
        const candidate = rebuildState.entries.find(entry => entry.status === 'queued' && (fileId === undefined || entry.id === fileId))
        if (!candidate) break
        rebuildState = startRebuild(rebuildState, candidate.id)
        try { await deploy(candidate) }
        catch (caught) {
          rebuildState = completeRebuild(rebuildState, candidate.id, 'failure', `${caught instanceof Error ? caught.message : 'Deployment failed.'} Refresh to reconcile uncertain results.`)
        }
      }
    }
    finally { running = false }
  }

  function deploymentLabel(entry: Entry) {
    if (!entry.artifactHash) return 'Not deployed'
    return entry.sourceHash === entry.deployedSourceHash ? 'Deployed' : 'Undeployed changes'
  }
</script>

<section class="mx-auto w-full max-w-6xl space-y-8 px-5 py-8 sm:px-8 lg:px-12" aria-labelledby="deploy-title">
  <header class="flex items-center justify-between gap-4">
    <div><h1 id="deploy-title" class="text-2xl font-semibold">Deploy</h1><p class="mt-2 text-sm text-muted-foreground">Svelte Source stays in the database. Choose where compiled JavaScript and CSS live.</p></div>
    <Button variant="outline" disabled={busy} onclick={() => void load()}>Refresh</Button>
  </header>

  {#if error}<p role="alert" class="text-sm text-destructive">{error}</p>{/if}
  {#if loading && files.length === 0}<p role="status">Loading pages…</p>{/if}

  <section class="rounded-xl border border-border bg-card p-5" aria-labelledby="new-pages-title">
    <h2 id="new-pages-title" class="font-semibold">Storage for new pages</h2>
    <p class="mt-2 text-sm text-muted-foreground">Applies to the first deployment only. Existing pages retain their mode until you migrate them below.</p>
    <div class="mt-4 flex flex-wrap items-center gap-3">
      <label class="text-sm">Default storage
        <select aria-label="Default storage for new pages" bind:value={selectedStorage} disabled={busy || !canConfigure} class="ml-2 rounded-lg border border-input bg-background px-3 py-2">
          <option value="d1">D1 — database</option>
          <option value="r2" disabled={!r2Available}>R2 — object storage</option>
        </select>
      </label>
      {#if canConfigure}<Button disabled={busy || selectedStorage === defaultStorage} onclick={() => void saveDefault()}>Save default</Button>{/if}
    </div>
    {#if !loading && !r2Available}<p class="mt-3 text-sm text-muted-foreground">R2 is unavailable: configure a private OSS bucket binding before choosing R2.</p>{/if}
    {#if r2Available}<p class="mt-3 text-sm text-muted-foreground">Keep the R2 bucket private; do not enable a public bucket domain.</p>{/if}
    {#if !loading && !canConfigure}<p class="mt-3 text-sm text-muted-foreground">Only an administrator can change the default.</p>{/if}
    {#if notice}<p role="status" class="mt-3 text-sm">{notice}</p>{/if}
  </section>

  <section aria-labelledby="existing-pages-title">
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h2 id="existing-pages-title" class="font-semibold">Existing pages <span class="text-muted-foreground">({files.length}{more ? '+' : ''})</span></h2>
      <details class="text-sm">
        <summary class="cursor-pointer">Batch deployment</summary>
        <div class="mt-3 space-y-3">
          <p class="text-muted-foreground">Deploy loaded active pages sequentially. Closing this tab stops scheduling; an in-flight request may finish.</p>
          <p role="status">{progress.success} succeeded · {progress.failure} failed · {progress.dependencyChanged} need review</p>
          <Button disabled={busy || !ready || progress.queued === 0} onclick={() => void startBatch()}>Start deployment</Button>
        </div>
      </details>
      {#if running}<Button variant="outline" disabled={stopRequested} onclick={() => stopRequested = true}>Stop after current page</Button>{/if}
    </div>
    {#if !loading && !error && !ready}<p class="mb-4 text-sm">An administrator must check and run the database migration in <a href="/dashboard/settings" class="underline">Settings</a> before deploying or migrating storage.</p>{/if}
    <ul class="m-0 list-none divide-y divide-border rounded-xl border border-border bg-card p-0" aria-label="Existing Svelte pages">
      {#each files as entry (entry.fileId)}
        {@const job = rebuildState.entries.find(candidate => candidate.id === entry.fileId)}
        <li class="space-y-3 p-4 sm:p-5" data-rebuild-path={entry.path} data-rebuild-status={job?.status ?? 'recycled'}>
          <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div class="min-w-0 flex-1">
              <a class="break-all font-mono text-sm underline underline-offset-4" href={`/dashboard/edit?id=${entry.fileId}`}>{entry.path}</a>
              <p class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span data-deployment-status>{deploymentLabel(entry)}</span>
                <span data-storage-mode>{entry.mode ? entry.mode.toUpperCase() : '—'}</span>
                {#if entry.deletedAt}<span>Recycled</span>{/if}
                {#if entry.deployedAt}<span>Deployed {new Date(entry.deployedAt).toLocaleString()}</span>{/if}
              </p>
            </div>
            <div class="flex flex-wrap gap-2">
              {#if entry.artifactHash && !entry.deletedAt}<Button variant="ghost" href={entry.path} target="_blank" rel="noreferrer">View page</Button>{/if}
              {#if job && (job.status === 'queued' || job.status === 'failure')}
                <Button variant="outline" disabled={busy || !ready} onclick={() => void startBatch(entry.fileId)}>{job.status === 'failure' ? 'Retry deployment' : entry.artifactHash ? 'Redeploy' : 'Deploy'}</Button>
              {/if}
              {#if entry.artifactHash && entry.mode}
                <Button variant="outline" disabled={busy || !ready || (entry.mode === 'd1' && !r2Available)} onclick={() => void migrate(entry)}>Move to {entry.mode === 'd1' ? 'R2' : 'D1'}</Button>
              {/if}
            </div>
          </div>
          {#if job && job.status !== 'queued'}<p class="text-sm" role="status">{job.status === 'running' ? 'Deploying…' : job.status === 'success' ? 'Deployment complete.' : job.message}</p>{/if}
          {#if outcomes[entry.fileId]}<p class="text-sm" role="status">{outcomes[entry.fileId]}</p>{/if}
        </li>
      {/each}
    </ul>
    {#if !loading && files.length === 0}<p class="mt-4 text-sm text-muted-foreground">No Svelte pages.</p>{/if}
    {#if more}<Button class="mt-4" variant="outline" disabled={busy} onclick={() => void load(true)}>Load next 50</Button>{/if}
  </section>
</section>
