import type { Page } from '@playwright/test'

export async function diagnoseSvelteSourceInBrowser(page: Page, source: string) {
  return page.evaluate(async (svelteSource) => {
    const workerClientModulePath = '/src/components/editor/svelte/worker-client.ts'
    const { SvelteWorkerClient } = await import(/* @vite-ignore */ workerClientModulePath)
    const client = new SvelteWorkerClient()
    client.diagnose(svelteSource)
    try {
      for (let attempt = 0; attempt < 800; attempt++) {
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
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await page.evaluate(async (svelteSource) => {
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
    catch (error) {
      if (attempt > 0 || !/Execution context was destroyed/.test(String(error)))
        throw error
      await page.waitForLoadState('networkidle')
    }
  }
  throw new Error('Svelte build retry was exhausted')
}
