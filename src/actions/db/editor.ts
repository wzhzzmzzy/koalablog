import { defineAction } from 'astro:actions'
import { z } from 'astro:schema'
import { readEditorCounts, readEditorFile, readEditorPrefix, readEditorTrash } from '@/db/editor'
import { readEditorReferences, readEditorTags } from '@/db/editor-completion'
import { readEditorFilesById, searchEditorFiles } from '@/db/editor-search'
import { parseAbsoluteFilePath, parseAbsolutePathPrefix } from '@/lib/files/path'
import { loginGuard } from '../utils/auth'

export const prefix = defineAction({
  input: z.object({
    prefix: z.string().refine(value => parseAbsolutePathPrefix(value).ok, 'Invalid Path Prefix'),
  }).strict(),
  handler: async (input, ctx) => {
    await loginGuard(ctx)
    return readEditorPrefix(ctx.locals.runtime?.env, input.prefix, ctx.locals.session.userId!)
  },
})

export const file = defineAction({
  input: z.union([
    z.object({ id: z.number().int().positive() }).strict(),
    z.object({ path: z.string().refine(value => parseAbsoluteFilePath(value).ok, 'Invalid File Path') }).strict(),
  ]),
  handler: async (target, ctx) => {
    await loginGuard(ctx)
    return readEditorFile(ctx.locals.runtime?.env, target, ctx.locals.session.userId!)
  },
})

export const trash = defineAction({
  handler: async (_, ctx) => {
    await loginGuard(ctx)
    const userId = ctx.locals.session.userId!
    const [files, counts] = await Promise.all([
      readEditorTrash(ctx.locals.runtime?.env, userId),
      readEditorCounts(ctx.locals.runtime?.env, userId),
    ])
    return { files, counts }
  },
})

export const search = defineAction({
  input: z.object({ query: z.string().trim().min(1).max(500), offset: z.number().int().min(0).default(0) }).strict(),
  handler: async (input, ctx) => {
    await loginGuard(ctx)
    return searchEditorFiles(ctx.locals.runtime?.env, ctx.locals.session.userId!, input.query, input.offset)
  },
})

export const files = defineAction({
  input: z.object({ ids: z.array(z.number().int().positive()).max(50) }).strict(),
  handler: async (input, ctx) => {
    await loginGuard(ctx)
    return readEditorFilesById(ctx.locals.runtime?.env, ctx.locals.session.userId!, input.ids)
  },
})

export const references = defineAction({
  input: z.object({ query: z.string().max(500) }).strict(),
  handler: async (input, ctx) => {
    await loginGuard(ctx)
    return readEditorReferences(ctx.locals.runtime?.env, ctx.locals.session.userId!, input.query)
  },
})

export const tags = defineAction({
  input: z.object({ query: z.string().max(500) }).strict(),
  handler: async (input, ctx) => {
    await loginGuard(ctx)
    return readEditorTags(ctx.locals.runtime?.env, ctx.locals.session.userId!, input.query)
  },
})
