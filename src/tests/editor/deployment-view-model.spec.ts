import { describe, expect, it } from 'vitest'
import { deployActionLabel } from '@/components/editor/deployment-view-model'

describe('svelte deployment action view model', () => {
  it('uses the shared deployment status to name the next explicit action', () => {
    expect(deployActionLabel({ status: 'not_applicable', deploying: false, failed: false })).toBeNull()
    expect(deployActionLabel({ status: 'not_deployed', deploying: false, failed: false })).toBe('Deploy')
    expect(deployActionLabel({ status: 'deployment_drift', deploying: false, failed: false })).toBe('Deploy changes')
    expect(deployActionLabel({ status: 'deployed', deploying: false, failed: false })).toBe('Rebuild')
  })

  it('gives operation state precedence without persisting it as deployment status', () => {
    expect(deployActionLabel({ status: 'deployment_drift', deploying: true, failed: true })).toBe('Deploying…')
    expect(deployActionLabel({ status: 'deployment_drift', deploying: false, failed: true })).toBe('Retry deploy')
  })
})
