import svelteRenderer from '@astrojs/svelte/server.js'
import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import { describe, expect, it, vi } from 'vitest'
import Settings from '@/pages/dashboard/settings.astro'

vi.mock('@/db/user', () => ({ listApiTokens: async () => [], listUsersWithFileStats: async () => [] }))
vi.mock('@/db/ossAccess', () => ({ readToday: async () => null }))

describe('settings server rendering', () => {
  it('renders the forms but leaves interactive settings and import/export out of the Worker render', async () => {
    const render = vi.fn(svelteRenderer.renderToStaticMarkup)
    const container = await AstroContainer.create()
    container.addServerRenderer({ name: '@astrojs/svelte', renderer: { ...svelteRenderer, renderToStaticMarkup: render } })
    container.addClientRenderer({ name: '@astrojs/svelte', entrypoint: '@astrojs/svelte/client.js' })
    const response = await container.renderToResponse(Settings, {
      locals: {
        session: { userId: 7, role: 'admin' },
        runtime: { env: {} },
        config: { pageConfig: {}, rss: { enable: true }, font: {}, oss: {} },
      } as any,
      request: new Request('https://koala.test/dashboard/settings'),
    })
    const html = await response.text()
    expect(response.status).toBe(200)
    expect(html).toContain('Update password')
    expect(html).toContain('name="rssEnable" checked')
    expect(html.match(/client="only"/g)).toHaveLength(5)
    expect(render).toHaveBeenCalledTimes(1)
  })
})
