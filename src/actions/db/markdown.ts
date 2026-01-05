import type { MarkdownSource } from '@/db'
import type { Markdown } from '@/db/types'
import { getMarkdownSourceKey, MarkdownSource } from '@/db'
import { batchAdd, generateMemoSubject, justReadAll, readAll, updateRefs as updateRefsDB } from '@/db/markdown'
import { defineAction } from 'astro:actions'
import { z } from 'astro:schema'
import { authGuard } from '../utils/auth'

export interface AllCollection {
  posts?: Markdown[]
  pages?: Markdown[]
  memos?: Markdown[]
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
    source: z.enum(['all', 'post', 'page', 'memo']).default('all'),
    deleted: z.boolean().default(false),
    limit: z.number().optional(),
    offset: z.number().optional(),
  })).default({}),
  handler: async (input, ctx) => {
    await authGuard(ctx)

    // Optimization: If specific source and not including deleted, use DB pagination
    if (input.source !== 'all' && !input.deleted) {
      const sourceEnum = input.source === 'post'
        ? MarkdownSource.Post
        : input.source === 'page' ? MarkdownSource.Page : MarkdownSource.Memo
      const records = await readAll(
        ctx.locals.runtime?.env,
        sourceEnum,
        false,
        { limit: input.limit, offset: input.offset },
      )

      return {
        [getMarkdownSourceKey(sourceEnum)!]: records,
      }
    }

    const allMarkdowns = await justReadAll(ctx.locals.runtime?.env)

    return allMarkdowns.reduce((prev, curr) => {
      if (curr.deleted && !input.deleted) {
        return prev
      }

      if (input.deleted && !prev.recycleBin) {
        prev.recycleBin = {}
      }

      const key = getMarkdownSourceKey(curr.source)
      const sourceType = (key === 'posts' || key === 'pages' || key === 'memos') ? key : null

      if (sourceType && (input.source === 'all' || input.source === sourceType.slice(0, -1))) {
        if (!prev[sourceType])
          prev[sourceType] = []

        if (curr.deleted) {
          if (!prev.recycleBin![sourceType])
            prev.recycleBin![sourceType] = []
          prev.recycleBin![sourceType].push(curr)
        }
        else {
          prev[sourceType].push(curr)
        }
      }

      if (input.source === 'all') {
        if (curr.source === MarkdownSource.Home) {
          prev.home = curr
        }
        if (curr.source === MarkdownSource.Nav) {
          prev.nav = curr
        }
      }

      return prev
    }, {} as AllCollection & { recycleBin?: AllCollection })
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
        outgoing_links: post.outgoingLinks ? JSON.stringify(post.outgoingLinks) : undefined,
      })),
    )
  },
})
