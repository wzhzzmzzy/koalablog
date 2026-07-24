import { mountPublicArtifact } from '@/lib/svelte/public-mount'
import { describe, expect, it, vi } from 'vitest'

function fixture() {
  const root = new EventTarget() as EventTarget & { dataset: Record<string, string> }
  root.dataset = {}
  const live = { hidden: true, replaceChildren: vi.fn() }
  const snapshot = { remove: vi.fn() }
  return { live, root, snapshot }
}

describe('public Svelte Artifact mount', () => {
  it('mounts into the explicit live target and only then swaps out the Snapshot', async () => {
    const { live, root, snapshot } = fixture()
    const mounted = vi.fn()
    const events: string[] = []
    root.addEventListener('koala:artifact-mounted', event => events.push(event.type))

    await mountPublicArtifact({
      importModule: vi.fn().mockResolvedValue({ mountKoalaArtifact: mounted }),
      live: live as unknown as HTMLElement,
      moduleUrl: '/api/render-artifacts/7/hash/module.js',
      root: root as unknown as HTMLElement,
      snapshot: snapshot as unknown as HTMLElement,
    })

    expect(mounted).toHaveBeenCalledWith(live)
    expect(snapshot.remove).toHaveBeenCalledOnce()
    expect(live.hidden).toBe(false)
    expect(root.dataset.koalaRenderState).toBe('mounted')
    expect(events).toEqual(['koala:artifact-mounted'])
  })

  it('preserves Snapshot and clears a partial live mount when the import or mount fails', async () => {
    const { live, root, snapshot } = fixture()
    const errors: string[] = []
    root.addEventListener('koala:artifact-error', event => errors.push((event as CustomEvent).detail.message))

    await mountPublicArtifact({
      importModule: vi.fn().mockResolvedValue({ mountKoalaArtifact: vi.fn().mockRejectedValue(new Error('mount failed')) }),
      live: live as unknown as HTMLElement,
      moduleUrl: '/api/render-artifacts/7/hash/module.js',
      root: root as unknown as HTMLElement,
      snapshot: snapshot as unknown as HTMLElement,
    })

    expect(live.replaceChildren).toHaveBeenCalledOnce()
    expect(snapshot.remove).not.toHaveBeenCalled()
    expect(live.hidden).toBe(true)
    expect(root.dataset.koalaRenderState).toBe('failed')
    expect(errors).toEqual(['mount failed'])
  })
})
