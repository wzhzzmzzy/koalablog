import {
  deleteApiToken,
  findUserById,
  findUserByUsername,
  createApiToken as insertApiToken,
  createUser as insertUser,
  updateUserPassword,
} from '@/db/user'
import { hashApiToken } from '@/lib/auth/api-token'
import { hashPassword, verifyPassword } from '@/lib/auth/password'
import { deleteSessionsForUser, SESSION_COOKIE_NAME } from '@/lib/auth/session'
import { ActionError, defineAction } from 'astro:actions'
import { z } from 'astro:schema'
import { authGuard, loginGuard } from '../utils/auth'

export const changePassword = defineAction({
  accept: 'json',
  input: z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(1),
  }),
  handler: async (input, ctx) => {
    await loginGuard(ctx)
    const env = ctx.locals.runtime?.env ?? {} as Env
    const user = await findUserById(env, ctx.locals.session.userId!)
    const passwordValid = user
      ? await verifyPassword(input.currentPassword, { salt: user.passwordSalt, hash: user.passwordHash })
      : false
    if (!user || !passwordValid) {
      throw new ActionError({
        code: 'UNAUTHORIZED',
        message: 'Wrong current password',
      })
    }

    const { salt, hash } = await hashPassword(input.newPassword)
    await updateUserPassword(env, user.id, { passwordHash: hash, passwordSalt: salt })

    const currentSessionId = ctx.cookies.get(SESSION_COOKIE_NAME)?.value
    await deleteSessionsForUser(env, user.id, undefined, currentSessionId)
  },
})

export const createApiToken = defineAction({
  accept: 'json',
  input: z.object({
    label: z.string().optional(),
  }),
  handler: async (input, ctx) => {
    await loginGuard(ctx)
    const env = ctx.locals.runtime?.env ?? {} as Env
    const token = crypto.randomUUID()
    const created = await insertApiToken(env, {
      userId: ctx.locals.session.userId!,
      tokenHash: await hashApiToken(token),
      label: input.label,
    })
    return { id: created.id, label: created.label, token, createdAt: created.createdAt }
  },
})

export const revokeApiToken = defineAction({
  accept: 'json',
  input: z.object({ id: z.number().int().positive() }),
  handler: async ({ id }, ctx) => {
    await loginGuard(ctx)
    const env = ctx.locals.runtime?.env ?? {} as Env
    const deleted = await deleteApiToken(env, id, ctx.locals.session.userId!)
    if (!deleted) {
      throw new ActionError({
        code: 'NOT_FOUND',
        message: 'API Token not found',
      })
    }
  },
})

export const createUser = defineAction({
  accept: 'json',
  input: z.object({
    username: z.string().min(1),
    password: z.string().min(1),
  }),
  handler: async (input, ctx) => {
    await authGuard(ctx)
    const env = ctx.locals.runtime?.env ?? {} as Env
    if (await findUserByUsername(env, input.username)) {
      throw new ActionError({
        code: 'CONFLICT',
        message: 'Username already exists',
      })
    }
    const { salt, hash } = await hashPassword(input.password)
    return insertUser(env, { username: input.username, passwordHash: hash, passwordSalt: salt, role: 'member' })
  },
})

export const resetPassword = defineAction({
  accept: 'json',
  input: z.object({
    userId: z.number().int().positive(),
    password: z.string().min(1),
  }),
  handler: async (input, ctx) => {
    await authGuard(ctx)
    const env = ctx.locals.runtime?.env ?? {} as Env
    const user = await findUserById(env, input.userId)
    if (!user) {
      throw new ActionError({
        code: 'NOT_FOUND',
        message: 'User not found',
      })
    }
    const { salt, hash } = await hashPassword(input.password)
    await updateUserPassword(env, user.id, { passwordHash: hash, passwordSalt: salt })
    await deleteSessionsForUser(env, user.id)
  },
})
