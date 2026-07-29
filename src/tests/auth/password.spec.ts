import { describe, expect, it } from 'vitest'
import { hashPassword, verifyPassword } from '@/lib/auth/password'

describe('password hashing', () => {
  it('verifies a password against its own salted hash', async () => {
    const stored = await hashPassword('correct horse battery staple')

    expect(stored.salt).toMatch(/^[0-9a-f]{32}$/)
    expect(stored.hash).toMatch(/^[0-9a-f]{64}$/)
    expect(await verifyPassword('correct horse battery staple', stored)).toBe(true)
    expect(await verifyPassword('Tr0ub4dor&3', stored)).toBe(false)
  })

  it('salts the same password differently every time', async () => {
    const first = await hashPassword('same-input')
    const second = await hashPassword('same-input')

    expect(first.salt).not.toBe(second.salt)
    expect(first.hash).not.toBe(second.hash)
  })

  it('matches the 10,000-iteration PBKDF2-SHA256 test vector', async () => {
    const stored = await hashPassword('correct horse battery staple', '0123456789abcdeffedcba9876543210')

    expect(stored.hash).toBe('25f0a5e2e91dabc068583aee44c802a0a13954d1d13765168ab0c81610738fc1')
  })

  it('continues to verify the legacy 50,000-iteration PBKDF2-SHA256 vector', async () => {
    const legacy = {
      salt: '0123456789abcdeffedcba9876543210',
      hash: '761e56ad81dbb14a00e6d44a9184d7df8b3029baa7d1bfcac6b198a9f44e262f',
    }

    expect(await verifyPassword('correct horse battery staple', legacy)).toBe(true)
  })
})
