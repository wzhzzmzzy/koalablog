<script lang="ts">
  import { onMount } from 'svelte'
  import { actions } from 'astro:actions'
  import SveltePreview from '@/components/editor/svelte/SveltePreview.svelte'
  import { SvelteBuildController } from '@/components/editor/svelte/build-controller.svelte'
  import { SVELTE_TOOLCHAIN_VERSIONS, UNOCSS_CONFIG_HASH } from '@/lib/svelte/toolchain'
  import type { SvelteBuildSuccess } from '@/lib/svelte/contracts'
  import type { PreviewArtifact } from '@/components/editor/svelte/preview-runtime'
  import { Badge } from '@/components/ui/badge'
  import { Button } from '@/components/ui/button'
  import { Card, CardContent } from '@/components/ui/card'
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

  function statusClass(entry: RebuildEntry) {
    if (entry.status === 'success') return 'border-[color:var(--koala-dashboard-success)]/40 bg-[color:var(--koala-dashboard-success)]/10 text-[color:var(--koala-dashboard-success)]'
    if (entry.status === 'failure') return 'border-destructive/40 bg-destructive/10 text-destructive'
    if (entry.status === 'dependency_changed') return 'border-[color:var(--koala-dashboard-warning)]/45 bg-[color:var(--koala-dashboard-warning)]/10 text-foreground'
    if (entry.status === 'running') return 'border-primary/40 bg-primary/10 text-primary'
    return 'border-border bg-muted text-muted-foreground'
  }
</script>

<section class="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 lg:px-12 xl:px-16" aria-labelledby="deploy-title">
  <header class="flex flex-col justify-between gap-5 border-b border-border pb-6 sm:flex-row sm:items-end">
    <div class="max-w-2xl">
      <p class="mb-2 text-sm font-medium text-muted-foreground">Svelte files</p>
      <h1 id="deploy-title" class="text-2xl font-semibold tracking-tight text-foreground">Deploy</h1>
      <p class="mt-2 text-sm text-muted-foreground">Deployments run sequentially in this open browser tab. Closing it stops the batch.</p>
    </div>
    <div class="flex flex-wrap gap-2">
      <Button variant="outline" type="button" onclick={() => void loadCandidates()} disabled={loading || running}>Refresh candidates</Button>
      {#if running}
        <Button variant="outline" type="button" onclick={stopBatch}>Stop after current step</Button>
      {:else}
        <Button type="button" onclick={() => void startBatch()} disabled={!canStart}>Start deployment</Button>
      {/if}
    </div>
  </header>

  {#if loadError}
    <p class="mt-6 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">{loadError}</p>
  {:else if loading}
    <p class="mt-6 text-sm text-muted-foreground" aria-live="polite">Loading active Svelte Files…</p>
  {:else}
    <div class="mt-6 flex flex-wrap gap-2" aria-live="polite">
      <Badge variant="outline">{progress.total} candidates</Badge>
      <Badge variant="outline" class="border-[color:var(--koala-dashboard-success)]/40 text-[color:var(--koala-dashboard-success)]">{progress.success} deployed</Badge>
      <Badge variant="outline" class="border-destructive/40 text-destructive">{progress.failure} failed</Badge>
      <Badge variant="outline" class="border-[color:var(--koala-dashboard-warning)]/45 text-foreground">{progress.dependencyChanged} review</Badge>
      <Badge variant="outline" class="text-muted-foreground">{progress.queued + progress.running} remaining</Badge>
    </div>

    {#if !previewReady}
      <p class="mt-3 text-sm text-muted-foreground">Preparing Preview for Snapshot capture…</p>
    {/if}

    {#if progress.total === 0}
      <p class="mt-8 text-sm text-muted-foreground">No active Svelte Files need deploying.</p>
    {:else}
      <ul class="mt-6 m-0 flex list-none flex-col gap-2 p-0" aria-label="Svelte deployment outcomes">
        {#each rebuildState.entries as entry (entry.id)}
          <li>
            <Card size="sm" data-rebuild-path={entry.path} data-rebuild-status={entry.status}>
              <CardContent class="space-y-3">
                <div class="flex flex-wrap items-center justify-between gap-3">
                  <a class="min-w-0 break-all font-mono text-sm text-foreground underline-offset-4 hover:text-primary hover:underline" href={`/dashboard/edit?id=${entry.id}`}>{entry.path}</a>
                  <Badge variant="outline" class={statusClass(entry)} aria-label={`Deployment status: ${statusLabel(entry)}`}>{statusLabel(entry)}</Badge>
                </div>
                {#if entry.message}
                  <p class="text-sm text-muted-foreground">{entry.message}</p>
                {/if}
                {#if entry.status === 'failure' && !running}
                  <Button variant="outline" size="sm" type="button" onclick={() => retry(entry)}>Retry deployment</Button>
                {:else if entry.status === 'dependency_changed'}
                  <p class="text-sm text-muted-foreground">Open the File in the editor to review its dependency change. This utility never confirms it.</p>
                {/if}
              </CardContent>
            </Card>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}

  <section class="mt-8" aria-label="Svelte Artifact Snapshot Preview">
    <div class="mb-3">
      <h2 class="text-sm font-medium text-foreground">Snapshot Preview</h2>
      <p class="mt-1 text-sm text-muted-foreground">The final processed File is rendered here only to capture its canonical Snapshot.</p>
    </div>
    <Card class="overflow-hidden">
      <div class="h-64 overflow-hidden bg-[color:var(--koala-dashboard-code)]">
        <SveltePreview bind:this={preview} onFocusReturn={() => {}} onReady={() => { previewReady = true }} />
      </div>
    </Card>
  </section>
</section>
