import { SELF } from 'cloudflare:test'
import { expect, it } from 'vitest'

it('uses isolated storage for each test', async () => {
  const response = await SELF.fetch('https://example.com/')
  expect(response.status).toBe(204)
})
