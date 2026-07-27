import type { UserRole } from '@/lib/auth/session'
import { and, asc, eq, isNull, sql } from 'drizzle-orm'
import { verifyPassword } from '@/lib/auth/password'
import { connectDB } from '.'
import { apiToken, markdown, user } from './schema'

export interface CreateUserInput {
  username: string
  passwordHash: string
  passwordSalt: string
  role: UserRole
}

export async function countUsers(env: Env): Promise<number> {
  return connectDB(env).$count(user)
}

export async function createUser(env: Env, input: CreateUserInput) {
  const [created] = await connectDB(env).insert(user).values(input).returning()
  return created
}

export interface FirstAdminRecord {
  id: number
  username: string
  role: UserRole
}

/**
 * Inserts the very first user as an Admin in a single atomic statement.
 * Returns null when any user already exists, so concurrent onboarding
 * attempts cannot both create an Admin.
 */
export async function createFirstAdmin(env: Env, input: Omit<CreateUserInput, 'role'>): Promise<FirstAdminRecord | null> {
  const rows = await connectDB(env).all<FirstAdminRecord>(sql`
    INSERT INTO "user" ("username", "passwordHash", "passwordSalt", "role")
    SELECT ${input.username}, ${input.passwordHash}, ${input.passwordSalt}, 'admin'
    WHERE NOT EXISTS (SELECT 1 FROM "user")
    RETURNING "id", "username", "role"
  `)
  return rows[0] ?? null
}

export function findUserByUsername(env: Env, username: string) {
  return connectDB(env).query.user.findFirst({ where: eq(user.username, username) })
}

export function findUserById(env: Env, id: number) {
  return connectDB(env).query.user.findFirst({ where: eq(user.id, id) })
}

export function findApiTokenByHash(env: Env, tokenHash: string) {
  return connectDB(env).query.apiToken.findFirst({ where: eq(apiToken.tokenHash, tokenHash) })
}

export async function createApiToken(env: Env, input: { userId: number, tokenHash: string, label?: string }) {
  const [created] = await connectDB(env).insert(apiToken).values(input).returning()
  return created
}

export function assignAllFilesToUser(env: Env, userId: number) {
  return connectDB(env).update(markdown).set({ userId }).where(isNull(markdown.userId))
}

const DUMMY_PASSWORD_HASH = {
  salt: '0123456789abcdeffedcba9876543210',
  hash: 'f5975e897ff04dd78637fb6ba396b0fb7242af2a21428a4171140e985c5696fc',
}

export async function verifyUserCredentials(env: Env, username: string, password: string) {
  const found = await findUserByUsername(env, username)
  const stored = found
    ? { salt: found.passwordSalt, hash: found.passwordHash }
    : DUMMY_PASSWORD_HASH
  const valid = await verifyPassword(password, stored)
  return found && valid ? found : null
}

export function updateUserPassword(env: Env, userId: number, input: { passwordHash: string, passwordSalt: string }) {
  return connectDB(env).update(user).set({ ...input, updatedAt: new Date() }).where(eq(user.id, userId)).returning()
}

export function listApiTokens(env: Env, userId: number) {
  return connectDB(env).query.apiToken.findMany({
    columns: { id: true, label: true, createdAt: true },
    where: eq(apiToken.userId, userId),
  })
}

export async function deleteApiToken(env: Env, id: number, userId: number) {
  const [deleted] = await connectDB(env).delete(apiToken).where(and(eq(apiToken.id, id), eq(apiToken.userId, userId))).returning()
  return deleted
}

export function listUsers(env: Env) {
  return connectDB(env).query.user.findMany({
    columns: { id: true, username: true, role: true, createdAt: true },
    orderBy: asc(user.username),
  })
}
