import process from 'node:process'

export const E2E_BASE_URL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:4322'
export const E2E_AUTHORIZATION = 'Bearer koalablog-playwright'
export const E2E_ADMIN = { username: 'admin', password: 'koalablog-playwright-pw' }
export const E2E_MEMBER = { username: 'friend', password: 'koalablog-playwright-pw' }
