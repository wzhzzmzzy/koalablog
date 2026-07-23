import type { Page } from '@playwright/test'

export async function diagnoseSvelteSourceInBrowser(page: Page, source: string) {
  return page.evaluate(async (svelteSource) => {
    const workerClientModulePath = '/src/components/editor/svelte/worker-client.ts'
    const { SvelteWorkerClient } = await import(/* @vite-ignore */ workerClientModulePath)
    const client = new SvelteWorkerClient()
    client.diagnose(svelteSource)
    try {
      for (let attempt = 0; attempt < 100; attempt++) {
        if (client.state.diagnostics)
          return client.state.diagnostics
        await new Promise(resolve => window.setTimeout(resolve, 25))
      }
      throw new Error('Svelte diagnose request timed out')
    }
    finally {
      client.dispose()
    }
  }, source)
}

export async function buildSvelteSourceInBrowser(page: Page, source: string) {
  return page.evaluate(async (svelteSource) => {
    const workerClientModulePath = '/src/components/editor/svelte/worker-client.ts'
    const { SvelteWorkerClient } = await import(/* @vite-ignore */ workerClientModulePath)
    const client = new SvelteWorkerClient()
    client.build(svelteSource)
    try {
      for (let attempt = 0; attempt < 800; attempt++) {
        if (client.state.build)
          return client.state.build
        await new Promise(resolve => window.setTimeout(resolve, 25))
      }
      throw new Error('Svelte build request timed out')
    }
    finally {
      client.dispose()
    }
  }, source)
}
