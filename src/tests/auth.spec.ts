import { describe, expect, it } from 'vitest'
import { authInterceptor } from '@/lib/auth'
import type { APIContext } from 'astro'

describe('authInterceptor', () => {
  it('should authenticate with valid Bearer Token', async () => {
    const config = {
      auth: {
        bearerToken: 'test-token',
        adminKey: 'admin-key'
      }
    }
    const ctx = {
      locals: { config },
      cookies: { 
        get: () => null,
        set: () => {}
      },
      request: {
        headers: new Headers({
          'Authorization': 'Bearer test-token'
        })
      }
    } as unknown as APIContext

    await authInterceptor(ctx)
    expect(ctx.locals.session.role).toBe('admin')
  })

  it('should not authenticate with invalid Bearer Token', async () => {
    const config = {
      auth: {
        bearerToken: 'test-token',
        adminKey: 'admin-key'
      }
    }
    const ctx = {
      locals: { config },
      cookies: { 
        get: () => null,
        set: () => {}
      },
      request: {
        headers: new Headers({
          'Authorization': 'Bearer wrong-token'
        })
      }
    } as unknown as APIContext

    await authInterceptor(ctx)
    expect(ctx.locals.session.role).toBe('')
  })

  it('should not authenticate if no Bearer Token is configured', async () => {
    const config = {
      auth: {
        adminKey: 'admin-key'
      }
    }
    const ctx = {
      locals: { config },
      cookies: { 
        get: () => null,
        set: () => {}
      },
      request: {
        headers: new Headers({
          'Authorization': 'Bearer some-token'
        })
      }
    } as unknown as APIContext

    await authInterceptor(ctx)
    expect(ctx.locals.session.role).toBe('')
  })

  it('should prefer Bearer Token over missing cookies', async () => {
    const config = {
      auth: {
        bearerToken: 'test-token',
        adminKey: 'admin-key'
      }
    }
    const ctx = {
      locals: { config },
      cookies: { 
        get: () => null,
        set: () => {}
      },
      request: {
        headers: new Headers({
          'Authorization': 'Bearer test-token'
        })
      }
    } as unknown as APIContext

    await authInterceptor(ctx)
    expect(ctx.locals.session.role).toBe('admin')
  })
})
