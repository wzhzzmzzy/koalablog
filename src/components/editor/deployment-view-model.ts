import type { SvelteDeploymentStatus } from '@/lib/svelte/deployment-status'

export function deployActionLabel(input: {
  status: SvelteDeploymentStatus
  deploying: boolean
  failed: boolean
}): 'Deploy' | 'Deploy changes' | 'Deploying…' | 'Rebuild' | 'Retry deploy' | null {
  if (input.status === 'not_applicable')
    return null
  if (input.deploying)
    return 'Deploying…'
  if (input.failed)
    return 'Retry deploy'
  if (input.status === 'not_deployed')
    return 'Deploy'
  if (input.status === 'deployment_drift')
    return 'Deploy changes'
  return 'Rebuild'
}
