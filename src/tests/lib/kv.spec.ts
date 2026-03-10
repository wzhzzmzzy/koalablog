import { describe, expect, it, vi } from 'vitest'
import { updateGlobalConfig } from '@/lib/kv'
import { storage } from '@/lib/kv/local'

vi.mock('@/lib/kv/local', () => ({
  storage: {
    get: vi.fn(),
    set: vi.fn(),
    sync: vi.fn(),
  },
}))

describe('updateGlobalConfig', () => {
  it('should correctly merge patches in non-CF mode', async () => {
    const initialConfig = {
      auth: { adminKey: 'old-admin-key' },
      pageConfig: { title: 'Old Title' },
      oss: {},
      font: {},
      _runtime: { ready: true }
    }
    
    vi.mocked(storage.get).mockResolvedValue(initialConfig)
    
    const env = {} as any // Non-CF mode
    
    await updateGlobalConfig(env, {
      auth: { bearerToken: 'new-token' },
      pageConfig: { title: 'New Title' }
    })
    
    // Check if the call to storage.set contains the merged config
    expect(storage.set).toHaveBeenCalledWith('_KoalaConfig_', expect.objectContaining({
      auth: { adminKey: 'old-admin-key', bearerToken: 'new-token' },
      pageConfig: { title: 'New Title' },
      _runtime: { ready: true }
    }))
  })

  it('should handle nested patches correctly', async () => {
     const initialConfig = {
      auth: { adminKey: 'key' },
      pageConfig: { title: 'T', theme: { light: 'latte', dark: 'mocha' } },
      oss: {},
      font: {},
      _runtime: { ready: true }
    }
    
    vi.mocked(storage.get).mockResolvedValue(initialConfig)
    
    const env = {} as any
    
    await updateGlobalConfig(env, {
      pageConfig: { theme: { light: 'frappe' } }
    })
    
    // Note: The current implementation of updateGlobalConfig only goes one level deep for patches
    // Object.keys(payload).forEach((scope) => {
    //   const updatedScopeConfig = { ...currentConfig[scope as S], ...patch }
    //   updatedConfig[scope as S] = updatedScopeConfig
    // })
    // So pageConfig.theme will be replaced entirely if we provide a theme patch, 
    // OR if we provide { pageConfig: { theme: { light: 'frappe' } } } it merges pageConfig.
    
    expect(storage.set).toHaveBeenCalledWith('_KoalaConfig_', expect.objectContaining({
      pageConfig: { title: 'T', theme: { light: 'frappe' } }
    }))
  })
})
