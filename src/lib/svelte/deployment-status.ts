import type { RendererMode } from '@/lib/files/types'

export type SvelteDeploymentStatus =
  | 'not_applicable'
  | 'not_deployed'
  | 'deployed'
  | 'deployment_drift'

export interface DeploymentSummary {
  status: SvelteDeploymentStatus
  deployedSourceHash: string | null
  artifactHash: string | null
}

interface DeploymentFile {
  renderer: RendererMode
  sourceHash: string
}

interface DeployedArtifact {
  artifactHash: string
  sourceHash: string
}

export function deploymentSummary(file: DeploymentFile, artifact: DeployedArtifact | null | undefined): DeploymentSummary {
  if (file.renderer !== 'svelte') {
    return {
      status: 'not_applicable',
      deployedSourceHash: null,
      artifactHash: null,
    }
  }

  if (!artifact) {
    return {
      status: 'not_deployed',
      deployedSourceHash: null,
      artifactHash: null,
    }
  }

  return {
    status: artifact.sourceHash === file.sourceHash ? 'deployed' : 'deployment_drift',
    deployedSourceHash: artifact.sourceHash,
    artifactHash: artifact.artifactHash,
  }
}
