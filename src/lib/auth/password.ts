const PBKDF2_ITERATIONS = 50_000
const SALT_BYTES = 16
const KEY_BITS = 256

export interface StoredPasswordHash {
  salt: string
  hash: string
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

export async function hashPassword(password: string, saltHex?: string): Promise<StoredPasswordHash> {
  const salt = saltHex ? fromHex(saltHex) : crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS },
    material,
    KEY_BITS,
  )
  return { salt: toHex(salt), hash: toHex(derived) }
}

export async function verifyPassword(password: string, stored: StoredPasswordHash): Promise<boolean> {
  const candidate = await hashPassword(password, stored.salt)
  return timingSafeEqual(candidate.hash, stored.hash)
}
