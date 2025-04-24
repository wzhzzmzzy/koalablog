import {
  createExecutionContext,
  env,
  waitOnExecutionContext,
} from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
// Import your worker so you can unit test it
// eslint-disable-next-line antfu/no-import-dist
import worker from '../dist/_worker.js/index.js'

// For now, you'll need to do something like this to get a correctly-typed
// `Request` to pass to `worker.fetch()`.
const IncomingRequest = Request<unknown, IncomingRequestCfProperties>

describe('hello World worker', () => {
  it('responds with Hello World!', async () => {
    const request = new IncomingRequest('http://example.com/404')
    // Create an empty context to pass to `worker.fetch()`
    const ctx = createExecutionContext()
    const response = await worker.fetch(request, env, ctx)
    // Wait for all `Promise`s passed to `ctx.waitUntil()` to settle before running test assertions
    await waitOnExecutionContext(ctx)
    expect(await response.status).toBe(404)
    expect(await response.text()).toBe('Not found')
  })
})
