import { and, asc, eq, isNull } from 'drizzle-orm'
import { connectDB } from '.'
import { apiToken, markdown, user } from './schema'

export interface CreateUserInput {
  username: string
  passwordHash: string
  passwordSalt: string
  role: 'admin' | 'member'
}

export async function countUsers(env: Env): Promise<number> {
  return connectDB(env).$count(user)
}

export async function createUser(env: Env, input: CreateUserInput) {
  const [created] = await connectDB(env).insert(user).values(input).returning()
  return created
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
