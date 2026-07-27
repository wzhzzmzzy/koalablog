import { hashPassword, verifyPassword } from '@/lib/auth/password'
import { describe, expect, it } from 'vitest'

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

  it('matches the frozen PBKDF2-SHA256 test vector', async () => {
    const stored = await hashPassword('correct horse battery staple', '0123456789abcdeffedcba9876543210')

    expect(stored.hash).toBe('f5975e897ff04dd78637fb6ba396b0fb7242af2a21428a4171140e985c5696fc')
  })
})
