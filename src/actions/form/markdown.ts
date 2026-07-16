import { FileInputError, saveFile, updatePrivate } from '@/db/markdown'
import { ActionError, defineAction } from 'astro:actions'
import { z } from 'astro:schema'
import { authGuard } from '../utils/auth'

function sourceConflict(current: unknown): never {
  throw new ActionError({
    code: 'CONFLICT',
    message: JSON.stringify({ code: 'source_conflict', current }),
  })
}

function notFound(): never {
  throw new ActionError({ code: 'NOT_FOUND', message: 'File not found' })
}

function handleSaveResult(result: Awaited<ReturnType<typeof saveFile>>) {
  if (result.status === 'conflict')
    return sourceConflict(result.current)
  if (result.status === 'path_conflict') {
    throw new ActionError({
      code: 'CONFLICT',
      message: JSON.stringify({ code: 'path_conflict', path: result.path }),
    })
  }
  if (result.status === 'not_found')
    return notFound()
  return result.file
}

export const save = defineAction({
  accept: 'form',
  input: z.object({
    id: z.preprocess(value => Number.parseInt(value as string, 10), z.number().int().gte(0)),
    path: z.string().min(1),
    content: z.string(),
    private: z.preprocess(value => value === 'true', z.boolean().default(false)),
    baseRevision: z.preprocess(value => Number.parseInt(value as string, 10), z.number().int().gte(0)),
    title: z.never().optional(),
    subject: z.never().optional(),
    source: z.never().optional(),
    tags: z.never().optional(),
    outgoingLinks: z.never().optional(),
  }).strict(),
  handler: async (input, ctx) => {
    await authGuard(ctx)
    try {
      const result = await saveFile(ctx.locals.runtime?.env || {}, input)
      return handleSaveResult(result)
    }
    catch (error) {
      if (error instanceof FileInputError) {
        throw new ActionError({
          code: 'BAD_REQUEST',
          message: JSON.stringify({ code: error.code, message: error.message }),
        })
      }
      throw error
    }
  },
})

export const setPrivate = defineAction({
  accept: 'form',
  input: z.object({
    id: z.preprocess(value => Number.parseInt(value as string, 10), z.number().int().positive()),
    private: z.preprocess(value => value === 'true' || value === true, z.boolean()),
    baseRevision: z.preprocess(value => Number.parseInt(value as string, 10), z.number().int().positive()),
  }).strict(),
  handler: async (input, ctx) => {
    await authGuard(ctx)
    const result = await updatePrivate(
      ctx.locals.runtime?.env || {},
      input.id,
      input.private,
      input.baseRevision,
    )
    return handleSaveResult(result)
  },
})
