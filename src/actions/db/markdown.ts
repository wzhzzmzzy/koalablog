import type { FileRecord } from '@/db/types'
import { getMarkdownSourceKey, MarkdownSource } from '@/db'
import { createFile } from '@/db/file-create'
import {
  batchAdd,
  emptyTrash as emptyTrashDB,
  justReadAll,
  purge as purgeFile,
  readAll,
  readByPrefix,
  restore as restoreFile,
  trash as trashFile,
} from '@/db/markdown'
import { parseAbsoluteFilePath, parseAbsolutePathPrefix } from '@/lib/files/path'
import { ActionError, defineAction } from 'astro:actions'
import { z } from 'astro:schema'
import { authGuard } from '../utils/auth'

export interface AllCollection {
  posts?: FileRecord[]
  pages?: FileRecord[]
  memos?: FileRecord[]
  wikis?: FileRecord[]
  home?: FileRecord
  nav?: FileRecord
}

export const create = defineAction({
  accept: 'json',
  input: z.object({
    targetPrefix: z.string().superRefine((prefix, ctx) => {
      const parsed = parseAbsolutePathPrefix(prefix)
      if (!parsed.ok)
        ctx.addIssue({ code: 'custom', message: `Invalid target Prefix: ${parsed.error.code}` })
    }),
  }).strict(),
  handler: async (input, ctx) => {
    await authGuard(ctx)
    const result = await createFile(ctx.locals.runtime?.env, input)
    if (result.status === 'path_conflict') {
      throw new ActionError({
        code: 'CONFLICT',
        message: JSON.stringify({ code: 'path_conflict', path: result.path }),
      })
    }
    if (result.status === 'catalog_absent') {
      throw new ActionError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Template Catalog is not initialized',
      })
    }
    return result.file
  },
})

export const all = defineAction({
  input: z.optional(z.object({
    source: z.enum(['all', 'post', 'page', 'memo', 'wiki']).default('all'),
    includeTrash: z.boolean().default(false),
  })).default({}),
  handler: async (input, ctx) => {
    await authGuard(ctx)
    if (input.source !== 'all' && !input.includeTrash) {
      const source = input.source === 'post'
        ? MarkdownSource.Post
        : input.source === 'page'
          ? MarkdownSource.Page
          : input.source === 'wiki' ? MarkdownSource.Wiki : MarkdownSource.Memo
      return { [getMarkdownSourceKey(source)!]: await readAll(ctx.locals.runtime?.env, source) }
    }

    const files = await justReadAll(ctx.locals.runtime?.env)
    return files.reduce((collection, file) => {
      if (file.deletedAt && !input.includeTrash)
        return collection
      if (input.includeTrash && !collection.recycleBin)
        collection.recycleBin = {}

      const key = getMarkdownSourceKey(file.source)
      const sourceType = (key === 'posts' || key === 'pages' || key === 'memos' || key === 'wikis') ? key : null
      const singularSourceType = sourceType === 'wikis' ? 'wiki' : sourceType?.slice(0, -1)
      if (!sourceType || (input.source !== 'all' && input.source !== singularSourceType))
        return collection

      if (!collection[sourceType])
        collection[sourceType] = []
      if (file.deletedAt) {
        if (!collection.recycleBin![sourceType])
          collection.recycleBin![sourceType] = []
        collection.recycleBin![sourceType].push(file)
      }
      else {
        collection[sourceType].push(file)
      }
      return collection
    }, {} as AllCollection & { recycleBin?: AllCollection })
  },
})

export const byPrefix = defineAction({
  input: z.object({
    prefix: z.string().superRefine((prefix, ctx) => {
      const parsed = parseAbsolutePathPrefix(prefix)
      if (!parsed.ok)
        ctx.addIssue({ code: 'custom', message: `Invalid Path Prefix: ${parsed.error.code}` })
    }).default('/'),
  }).default({ prefix: '/' }),
  handler: async ({ prefix }, ctx) => {
    await authGuard(ctx)
    return readByPrefix(ctx.locals.runtime?.env, prefix)
  },
})

export const trash = defineAction({
  input: z.object({ id: z.number().int().positive() }),
  handler: async ({ id }, ctx) => {
    await authGuard(ctx)
    return trashFile(ctx.locals.runtime?.env || {}, id)
  },
})

export const restore = defineAction({
  input: z.object({
    id: z.number().int().positive(),
    renameOnConflict: z.boolean().default(false),
  }),
  handler: async ({ id, renameOnConflict }, ctx) => {
    await authGuard(ctx)
    return restoreFile(ctx.locals.runtime?.env || {}, id, renameOnConflict)
  },
})

export const purge = defineAction({
  input: z.object({ id: z.number().int().positive() }),
  handler: async ({ id }, ctx) => {
    await authGuard(ctx)
    return purgeFile(ctx.locals.runtime?.env || {}, id)
  },
})

export const emptyTrash = defineAction({
  handler: async (_, ctx) => {
    await authGuard(ctx)
    return emptyTrashDB(ctx.locals.runtime?.env || {})
  },
})

export const batchImport = defineAction({
  input: z.array(z.object({
    path: z.string().superRefine((path, ctx) => {
      const parsed = parseAbsoluteFilePath(path)
      if (!parsed.ok)
        ctx.addIssue({ code: 'custom', message: `Invalid File Path: ${parsed.error.code}` })
    }),
    content: z.string(),
  }).strict()),
  accept: 'json',
  handler: async (input, ctx) => {
    await authGuard(ctx)
    return batchAdd(ctx.locals.runtime?.env, input.map((file) => {
      const parsed = parseAbsoluteFilePath(file.path)
      if (!parsed.ok) {
        throw new ActionError({
          code: 'BAD_REQUEST',
          message: `Invalid File Path: ${parsed.error.code}`,
        })
      }
      return {
        path: parsed.value,
        content: file.content,
        private: parsed.value.startsWith('/memo/'),
      }
    }))
  },
})
