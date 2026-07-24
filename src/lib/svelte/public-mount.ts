export interface PublicArtifactElements {
  live: HTMLElement
  root: HTMLElement
  snapshot: HTMLElement
}

export interface PublicArtifactModule {
  mountKoalaArtifact: (target: HTMLElement) => Promise<{ unmount: () => void }>
}

export interface MountPublicArtifactInput extends PublicArtifactElements {
  importModule: (url: string) => Promise<PublicArtifactModule>
  moduleUrl: string
}

function detail(error: unknown) {
  return { message: error instanceof Error ? error.message : String(error) }
}

export async function mountPublicArtifact(input: MountPublicArtifactInput) {
  const { live, root, snapshot } = input
  try {
    const artifact = await input.importModule(input.moduleUrl)
    await artifact.mountKoalaArtifact(live)
    snapshot.remove()
    live.hidden = false
    root.dataset.koalaRenderState = 'mounted'
    root.dispatchEvent(new CustomEvent('koala:artifact-mounted'))
  }
  catch (error) {
    try {
      live.replaceChildren()
    }
    catch {
      // A trusted Artifact can leave a malformed live target; Snapshot remains visible either way.
    }
    root.dataset.koalaRenderState = 'failed'
    root.dispatchEvent(new CustomEvent('koala:artifact-error', { detail: detail(error) }))
  }
}
