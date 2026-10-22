import { ActionError, defineAction } from 'astro:actions'
import { z } from 'astro:schema'
import { artifactSchemaStatus, migrateArtifactSchema } from '@/db/artifact-migration'
import { listArtifactStorage, transferArtifactStorage } from '@/db/artifact-transfer'
import { authGuard, loginGuard } from '../utils/auth'

export const schemaStatus = defineAction({
  handler: async (_, ctx) => {
    await authGuard(ctx)
    const { columns: _columns, ...status } = await artifactSchemaStatus(ctx.locals.runtime?.env || {}, true)
    return status
  },
})

export const migrateSchema = defineAction({
  input: z.object({ backupConfirmed: z.literal(true), removeSnapshots: z.literal(true) }).strict(),
  handler: async (_, ctx) => {
    await authGuard(ctx)
    const { columns: _columns, ...status } = await migrateArtifactSchema(ctx.locals.runtime?.env || {})
    return status
  },
})

export const list = defineAction({
  input: z.object({ afterId: z.number().int().nonnegative().default(0) }).strict(),
  handler: async (input, ctx) => {
    await loginGuard(ctx)
    const env = ctx.locals.runtime?.env || {}
    if (!(await artifactSchemaStatus(env)).ready)
      return { ready: false, r2Available: Boolean(env.OSS), files: [] }
    return { ready: true, r2Available: Boolean(env.OSS), files: await listArtifactStorage(env, ctx.locals.session.userId!, input.afterId) }
  },
})

export const transfer = defineAction({
  input: z.object({
    fileId: z.number().int().positive(),
    artifactHash: z.string().regex(/^[a-f0-9]{64}$/),
    from: z.enum(['d1', 'r2']),
    to: z.enum(['d1', 'r2']),
  }).strict(),
  handler: async (input, ctx) => {
    await loginGuard(ctx)
    const env = ctx.locals.runtime?.env || {}
    if (!(await artifactSchemaStatus(env)).ready)
      throw new ActionError({ code: 'CONFLICT', message: 'Run the database migration in Settings first.' })
    const result = await transferArtifactStorage(env, { ...input, ownerId: ctx.locals.session.userId! })
    if (result.status === 'conflict')
      throw new ActionError({ code: 'CONFLICT', message: 'Artifact changed or is unavailable. Refresh before retrying.' })
    return result
  },
})
