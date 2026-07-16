import type { Markdown } from '@/db/types'
import { getMarkdownSourceKey, MarkdownSource } from '@/db'
import { batchAdd, emptyTrash as emptyTrashDB, generateMemoSubject, justReadAll, purge as purgeMarkdown, readAll, readByPrefix, restore as restoreMarkdown, trash as trashMarkdown, updateRefs as updateRefsDB } from '@/db/markdown'
import { defineAction } from 'astro:actions'
import { z } from 'astro:schema'
import { authGuard } from '../utils/auth'

export interface AllCollection {
  posts?: Markdown[]
  pages?: Markdown[]
  memos?: Markdown[]
  wikis?: Markdown[]
  home?: Markdown
  nav?: Markdown
}

export const getNewMemoSubject = defineAction({
  handler: async (_, ctx) => {
    await authGuard(ctx)
    return generateMemoSubject(ctx.locals.runtime?.env)
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
      const sourceEnum = input.source === 'post'
        ? MarkdownSource.Post
        : input.source === 'page'
          ? MarkdownSource.Page
          : input.source === 'wiki' ? MarkdownSource.Wiki : MarkdownSource.Memo
      const records = await readAll(
        ctx.locals.runtime?.env,
        sourceEnum,
      )

      return {
        [getMarkdownSourceKey(sourceEnum)!]: records,
      }
    }

    const allMarkdowns = await justReadAll(ctx.locals.runtime?.env)

    return allMarkdowns.reduce((prev, curr) => {
      if (curr.deletedAt && !input.includeTrash) {
        return prev
      }

      if (input.includeTrash && !prev.recycleBin) {
        prev.recycleBin = {}
      }

      const key = getMarkdownSourceKey(curr.source)
      const sourceType = (key === 'posts' || key === 'pages' || key === 'memos' || key === 'wikis') ? key : null

      const singularSourceType = sourceType === 'wikis' ? 'wiki' : sourceType?.slice(0, -1)
      if (sourceType && (input.source === 'all' || input.source === singularSourceType)) {
        if (!prev[sourceType])
          prev[sourceType] = []

        if (curr.deletedAt) {
          if (!prev.recycleBin![sourceType])
            prev.recycleBin![sourceType] = []
          prev.recycleBin![sourceType].push(curr)
        }
        else {
          prev[sourceType].push(curr)
        }
      }

      return prev
    }, {} as AllCollection & { recycleBin?: AllCollection })
  },
})

export const byPrefix = defineAction({
  input: z.object({
    prefix: z.string().default(''),
  }).default({ prefix: '' }),
  handler: async ({ prefix }, ctx) => {
    await authGuard(ctx)

    return readByPrefix(ctx.locals.runtime?.env, prefix)
  },
})

export const trash = defineAction({
  input: z.object({ id: z.number().int().positive() }),
  handler: async ({ id }, ctx) => {
    await authGuard(ctx)
    return trashMarkdown(ctx.locals.runtime?.env || {}, id)
  },
})

export const restore = defineAction({
  input: z.object({
    id: z.number().int().positive(),
    renameOnConflict: z.boolean().default(false),
  }),
  handler: async ({ id, renameOnConflict }, ctx) => {
    await authGuard(ctx)
    return restoreMarkdown(ctx.locals.runtime?.env || {}, id, renameOnConflict)
  },
})

export const purge = defineAction({
  input: z.object({ id: z.number().int().positive() }),
  handler: async ({ id }, ctx) => {
    await authGuard(ctx)
    return purgeMarkdown(ctx.locals.runtime?.env || {}, id)
  },
})

export const emptyTrash = defineAction({
  handler: async (_, ctx) => {
    await authGuard(ctx)
    return emptyTrashDB(ctx.locals.runtime?.env || {})
  },
})

export const updateRefs = defineAction({
  input: z.array(z.object({
    id: z.number(),
    outgoingLinks: z.array(z.object({
      subject: z.string(),
      link: z.string(),
    })).default([]),
  })),
  accept: 'json',
  handler: async (input, ctx) => {
    await authGuard(ctx)

    return updateRefsDB(
      ctx.locals.runtime?.env,
      input.map(i => ({ id: i.id, outgoing_links: JSON.stringify(i.outgoingLinks) })),
    )
  },
})

export const batchImport = defineAction({
  input: z.array(z.object({
    subject: z.string(),
    content: z.string(),
    tags: z.string().optional(),
    source: z.nativeEnum(MarkdownSource).default(MarkdownSource.Post),
    link: z.string().optional(),
    private: z.boolean().optional(),
    createdAt: z.preprocess((val) => {
      if (typeof val === 'string') {
        const date = new Date(val)
        return Number.isNaN(date.getTime()) ? undefined : date
      }
      return val
    }, z.date().optional()),
    updatedAt: z.preprocess((val) => {
      if (typeof val === 'string') {
        const date = new Date(val)
        return Number.isNaN(date.getTime()) ? undefined : date
      }
      return val
    }, z.date().optional()),
    deletedAt: z.preprocess((val) => {
      if (typeof val === 'string') {
        const date = new Date(val)
        return Number.isNaN(date.getTime()) ? undefined : date
      }
      return val
    }, z.date().nullable().optional()),
    outgoingLinks: z.array(z.object({
      subject: z.string(),
      link: z.string(),
    })).optional(),
  })),
  accept: 'json',
  handler: async (input, ctx) => {
    await authGuard(ctx)

    return batchAdd(
      ctx.locals.runtime?.env,
      input.map(post => ({
        source: post.source as MarkdownSource,
        subject: post.subject,
        content: post.content,
        tags: post.tags,
        link: post.link,
        private: post.private,
        createdAt: post.createdAt,
        updatedAt: post.updatedAt,
        deletedAt: post.deletedAt ?? undefined,
        outgoing_links: post.outgoingLinks ? JSON.stringify(post.outgoingLinks) : undefined,
      })),
    )
  },
})
