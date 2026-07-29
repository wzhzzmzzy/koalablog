const PBKDF2_ITERATIONS = 10_000
const LEGACY_PBKDF2_ITERATIONS = [50_000]
const SALT_BYTES = 16
const KEY_BITS = 256

export interface StoredPasswordHash {
  salt: string
  hash: string
}

export interface PasswordVerification {
  valid: boolean
  needsRehash: boolean
}

export function toHex(input: ArrayBuffer | Uint8Array): string {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
  let hex = ''
  for (const byte of bytes)
    hex += byte.toString(16).padStart(2, '0')
  return hex
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let index = 0; index < bytes.length; index++)
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16)
  return bytes
}

function timingSafeEqual(left: string, right: string): boolean {
  if (left.length !== right.length)
    return false
  let diff = 0
  for (let index = 0; index < left.length; index++)
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index)
  return diff === 0
}

async function derivePasswordHash(password: string, salt: Uint8Array, iterations: number): Promise<string> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    KEY_BITS,
  )
  return toHex(derived)
}

export async function hashPassword(password: string, saltHex?: string): Promise<StoredPasswordHash> {
  const salt = saltHex ? fromHex(saltHex) : crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const hash = await derivePasswordHash(password, salt, PBKDF2_ITERATIONS)
  return { salt: toHex(salt), hash }
}

export async function verifyPasswordWithRehash(password: string, stored: StoredPasswordHash): Promise<PasswordVerification> {
  const salt = fromHex(stored.salt)
  const currentHash = await derivePasswordHash(password, salt, PBKDF2_ITERATIONS)
  if (timingSafeEqual(currentHash, stored.hash))
    return { valid: true, needsRehash: false }

  for (const iterations of LEGACY_PBKDF2_ITERATIONS) {
    const legacyHash = await derivePasswordHash(password, salt, iterations)
    if (timingSafeEqual(legacyHash, stored.hash))
      return { valid: true, needsRehash: true }
  }

  return { valid: false, needsRehash: false }
}

export async function verifyPassword(password: string, stored: StoredPasswordHash): Promise<boolean> {
  return (await verifyPasswordWithRehash(password, stored)).valid
}
