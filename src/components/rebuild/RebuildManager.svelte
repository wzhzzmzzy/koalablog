<script lang="ts">
  import { onMount } from 'svelte'
  import { actions } from 'astro:actions'
  import SveltePreview from '@/components/editor/svelte/SveltePreview.svelte'
  import { SvelteBuildController } from '@/components/editor/svelte/build-controller.svelte'
  import { SVELTE_TOOLCHAIN_VERSIONS, UNOCSS_CONFIG_HASH } from '@/lib/svelte/toolchain'
  import type { SvelteBuildSuccess } from '@/lib/svelte/contracts'
  import type { PreviewArtifact } from '@/components/editor/svelte/preview-runtime'
  import {
    completeRebuild,
    createRebuildState,
    nextRebuildCandidate,
    pauseRebuild,
    rebuildCandidates,
    rebuildProgress,
    retryFailedRebuild,
    startRebuild,
    type RebuildCandidate,
    type RebuildEntry,
  } from './rebuild-model'

  const buildController = new SvelteBuildController()
  let rebuildState = $state(createRebuildState([]))
  let loading = $state(true)
  let loadError = $state<string | null>(null)
  let running = $state(false)
  let previewReady = $state(false)
  let preview: SveltePreview | undefined = $state()
  let runGeneration = 0

  const progress = $derived(rebuildProgress(rebuildState))
  const canStart = $derived(!loading && !running && previewReady && progress.queued > 0)

  onMount(() => {
    void loadCandidates()
    return () => {
      runGeneration += 1
      buildController.dispose()
    }
  })

  async function loadCandidates() {
    if (running)
      return
    loading = true
    loadError = null
    const result = await actions.db.markdown.all({ includeTrash: false })
    if (result.error) {
      loadError = result.error.message
    }
    else {
      rebuildState = createRebuildState(rebuildCandidates(result.data))
    }
    loading = false
  }

  function isCurrentRun(generation: number) {
    return running && generation === runGeneration
  }

  async function waitForSavedBuild(candidate: RebuildCandidate, generation: number): Promise<SvelteBuildSuccess> {
    await buildController.saved({
      enabled: true,
      fileId: candidate.id,
      renderer: 'svelte',
      source: candidate.content,
      sourceHash: candidate.sourceHash,
    })

    for (let attempt = 0; attempt < 200; attempt += 1) {
      if (!isCurrentRun(generation))
        throw new Error('Batch rebuild stopped')
      const build = buildController.build
      if (build?.type === 'build-success')
        return build
      if (build?.type === 'build-error')
        throw new Error(build.error.message)
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    throw new Error('Svelte Artifact build timed out')
  }

  function dependencyChanged(error: { message: string }) {
    try {
      const detail = JSON.parse(error.message) as { code?: string }
      return detail.code === 'dependency_changed'
    }
    catch {
      return false
    }
  }

  async function attachSavedBuild(candidate: RebuildCandidate, build: SvelteBuildSuccess, generation: number) {
    if (!preview || !isCurrentRun(generation))
      throw new Error('Batch rebuild stopped')
    const artifact: PreviewArtifact = { css: build.css, javascript: build.javascript }
    const snapshotHtml = await preview.snapshot(artifact)
    if (!isCurrentRun(generation))
      throw new Error('Batch rebuild stopped')
    if (!snapshotHtml)
      throw new Error('Svelte Preview did not produce an Artifact Snapshot')

    return actions.db.renderArtifact.attach({
      fileId: candidate.id,
      schemaVersion: 1,
      renderer: 'svelte',
      svelteVersion: SVELTE_TOOLCHAIN_VERSIONS.svelte,
      unocssVersion: SVELTE_TOOLCHAIN_VERSIONS.unocss,
      unocssConfigHash: UNOCSS_CONFIG_HASH,
      sourceHash: candidate.sourceHash,
      dependencies: build.dependencies,
      javascript: build.javascript,
      css: build.css,
      snapshotHtml,
    })
  }

  async function rebuildCandidate(candidate: RebuildEntry, generation: number) {
    const build = await waitForSavedBuild(candidate, generation)
    const result = await attachSavedBuild(candidate, build, generation)
    if (!isCurrentRun(generation))
      return { status: 'failure' as const, message: 'Batch rebuild stopped' }
    if (!result.error)
      return { status: 'success' as const }
    if (dependencyChanged(result.error)) {
      return {
        status: 'dependency_changed' as const,
        message: 'Dependencies changed; review and confirm this File in the editor.',
      }
    }
    return { status: 'failure' as const, message: result.error.message }
  }

  async function startBatch() {
    if (!canStart)
      return
    running = true
    const generation = ++runGeneration

    try {
      while (isCurrentRun(generation)) {
        const candidate = nextRebuildCandidate(rebuildState)
        if (!candidate)
          return
        rebuildState = startRebuild(rebuildState, candidate.id)
        try {
          const outcome = await rebuildCandidate(candidate, generation)
          if (!isCurrentRun(generation))
            return
          rebuildState = completeRebuild(rebuildState, candidate.id, outcome.status, outcome.message)
        }
        catch (error) {
          if (!isCurrentRun(generation))
            return
          rebuildState = completeRebuild(
            rebuildState,
            candidate.id,
            'failure',
            error instanceof Error ? error.message : 'Svelte Artifact rebuild failed',
          )
        }
      }
    }
    finally {
      if (generation === runGeneration)
        running = false
    }
  }

  function stopBatch() {
    if (!running)
      return
    runGeneration += 1
    running = false
    buildController.previewClosed()
    rebuildState = pauseRebuild(rebuildState)
  }

  function retry(entry: RebuildEntry) {
    rebuildState = retryFailedRebuild(rebuildState, entry.id)
    void startBatch()
  }

  function statusLabel(entry: RebuildEntry) {
    if (entry.status === 'dependency_changed')
      return 'dependency_changed'
    return entry.status
  }
</script>

<section class="w-full px-4 pb-8 sm:px-6" aria-labelledby="rebuild-title">
  <header class="flex flex-wrap items-center justify-between gap-3">
    <div>
      <h1 id="rebuild-title" class="mb-1">Rebuild Svelte Artifacts</h1>
      <p class="m-0 text-sm opacity-80">Builds run sequentially in this open browser tab. Closing it stops the batch.</p>
    </div>
    <div class="flex flex-wrap gap-2">
      <button class="btn" type="button" onclick={() => void loadCandidates()} disabled={loading || running}>Refresh candidates</button>
      {#if running}
        <button class="btn" type="button" onclick={stopBatch}>Stop after current step</button>
      {:else}
        <button class="btn" type="button" onclick={() => void startBatch()} disabled={!canStart}>Start rebuild</button>
      {/if}
    </div>
  </header>

  {#if loadError}
    <p class="error mt-4" role="alert">{loadError}</p>
  {:else if loading}
    <p class="mt-4" aria-live="polite">Loading active Svelte Files…</p>
  {:else}
    <p class="mt-4" aria-live="polite">
      {progress.total} candidates · {progress.success} rebuilt · {progress.failure} failed · {progress.dependencyChanged} dependency_changed · {progress.queued + progress.running} remaining
    </p>

    {#if !previewReady}
      <p class="mt-2 text-sm opacity-80">Preparing Preview for Snapshot capture…</p>
    {/if}

    {#if progress.total === 0}
      <p class="mt-4">No active Svelte Files need rebuilding.</p>
    {:else}
      <ul class="mt-4 m-0 list-none p-0 flex flex-col gap-2" aria-label="Svelte rebuild outcomes">
        {#each rebuildState.entries as entry (entry.id)}
          <li class="rounded border border-[--koala-border] p-3" data-rebuild-path={entry.path} data-rebuild-status={entry.status}>
            <div class="flex flex-wrap items-center justify-between gap-2">
              <a class="font-mono text-sm break-all" href={`/dashboard/edit?id=${entry.id}`}>{entry.path}</a>
              <span class="text-sm" aria-label={`Rebuild status: ${statusLabel(entry)}`}>{statusLabel(entry)}</span>
            </div>
            {#if entry.message}
              <p class="mb-0 mt-2 text-sm">{entry.message}</p>
            {/if}
            {#if entry.status === 'failure' && !running}
              <button class="btn mt-2" type="button" onclick={() => retry(entry)}>Retry build</button>
            {:else if entry.status === 'dependency_changed'}
              <p class="mb-0 mt-2 text-sm">Open the File in the editor to review its dependency change. This utility never confirms it.</p>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  {/if}

  <section class="mt-6" aria-label="Svelte Artifact Snapshot Preview">
    <h2 class="text-base">Snapshot Preview</h2>
    <p class="mt-0 text-sm opacity-80">The final processed File is rendered here only to capture its canonical Snapshot.</p>
    <div class="h-64 overflow-hidden rounded border border-[--koala-border]">
      <SveltePreview bind:this={preview} onFocusReturn={() => {}} onReady={() => { previewReady = true }} />
    </div>
  </section>
</section>
