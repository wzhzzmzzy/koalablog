import svelteRenderer from '@astrojs/svelte/server.js'
import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import OssDashboard from '@/pages/dashboard/oss.astro'

const mocks = vi.hoisted(() => ({ incrementToday: vi.fn() }))
vi.mock('@/db/ossAccess', () => ({ incrementToday: mocks.incrementToday }))

beforeEach(() => vi.clearAllMocks())

describe('global OSS Dashboard', () => {
  it.each(['', 'member'])('rejects role %s before listing any bucket keys or using quota', async (role) => {
    const container = await AstroContainer.create()
    const list = vi.fn()
    const response = await container.renderToResponse(OssDashboard, {
      locals: { session: { role, userId: role ? 7 : null }, OSS: { list } } as any,
      request: new Request('https://koala.test/dashboard/oss'),
    })
    expect(response.status).toBe(302)
    expect(response.headers.get('Location')).toBe('/dashboard')
    expect(mocks.incrementToday).not.toHaveBeenCalled()
    expect(list).not.toHaveBeenCalled()
  })

  it('preserves the Admin listing through its last operation slot', async () => {
    const container = await AstroContainer.create()
    container.addServerRenderer({ name: '@astrojs/svelte', renderer: svelteRenderer })
    container.addClientRenderer({ name: '@astrojs/svelte', entrypoint: '@astrojs/svelte/client.js' })
    const list = vi.fn().mockResolvedValue({ objects: [] })
    mocks.incrementToday.mockResolvedValue([{ operateTimes: 1 }])
    const response = await container.renderToResponse(OssDashboard, {
      locals: {
        session: { role: 'admin', userId: 7 },
        OSS: { list },
        runtime: { env: {} },
        config: { oss: { operateLimit: 1 }, font: {}, pageConfig: { theme: 'light', title: 'KoalaBlog' } },
      } as any,
      request: new Request('https://koala.test/dashboard/oss'),
    })
    expect(response.status).toBe(200)
    expect(await response.text()).toContain('No files are stored yet.')
    expect(mocks.incrementToday).toHaveBeenCalledWith({}, 1, 'operate')
    expect(list).toHaveBeenCalledTimes(1)
  })
})
