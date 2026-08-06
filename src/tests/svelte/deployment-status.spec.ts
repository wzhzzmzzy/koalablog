import { describe, expect, it } from 'vitest'
import { deploymentSummary } from '@/lib/svelte/deployment-status'

const fileHash = 'a'.repeat(64)
const deployedHash = 'b'.repeat(64)
const artifactHash = 'c'.repeat(64)

describe('svelte deployment status', () => {
  it('treats a Markdown File as not applicable even when a dormant Artifact row remains', () => {
    expect(deploymentSummary(
      { renderer: 'markdown', sourceHash: fileHash },
      { sourceHash: deployedHash, artifactHash },
    )).toEqual({
      status: 'not_applicable',
      deployedSourceHash: null,
      artifactHash: null,
    })
  })

  it('reports an undeployed Svelte File without an Artifact', () => {
    expect(deploymentSummary({ renderer: 'svelte', sourceHash: fileHash }, undefined)).toEqual({
      status: 'not_deployed',
      deployedSourceHash: null,
      artifactHash: null,
    })
  })

  it('reports deployed when saved Source exactly matches the deployed Artifact', () => {
    expect(deploymentSummary(
      { renderer: 'svelte', sourceHash: fileHash },
      { sourceHash: fileHash, artifactHash },
    )).toEqual({
      status: 'deployed',
      deployedSourceHash: fileHash,
      artifactHash,
    })
  })

  it('reports deployment drift while retaining the deployed Artifact identity', () => {
    expect(deploymentSummary(
      { renderer: 'svelte', sourceHash: fileHash },
      { sourceHash: deployedHash, artifactHash },
    )).toEqual({
      status: 'deployment_drift',
      deployedSourceHash: deployedHash,
      artifactHash,
    })
  })

  it('returns to deployed after an exact Source reversion without a replacement Artifact', () => {
    expect(deploymentSummary(
      { renderer: 'svelte', sourceHash: deployedHash },
      { sourceHash: deployedHash, artifactHash },
    ).status).toBe('deployed')
  })
})
