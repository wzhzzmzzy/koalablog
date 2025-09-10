import type { PostOrPage } from '@/db'
import type { Markdown } from '@/db/types'
import { MarkdownSource } from '@/db'
import { batchAdd, justReadAll, updateRefs as updateRefsDB } from '@/db/markdown'
import { defineAction } from 'astro:actions'
import { z } from 'astro:schema'
import { authGuard } from '../utils/auth'

export interface AllCollection {
  posts?: Markdown[]
  pages?: Markdown[]
  home?: Markdown
  nav?: Markdown
}

export const all = defineAction({
  input: z.optional(z.object({
    source: z.enum(['all', 'post', 'page']).default('all'),
    deleted: z.boolean().default(false),
  })).default({}),
  handler: async (input, ctx) => {
    await authGuard(ctx)

    const allMarkdowns = await justReadAll(ctx.locals.runtime?.env)

    return allMarkdowns.reduce((prev, curr) => {
      if (curr.deleted && !input.deleted) {
        return prev
      }

      if (input.deleted && !prev.recycleBin) {
        prev.recycleBin = {}
      }

      const sourceType = curr.source === MarkdownSource.Post
        ? 'posts'
        : curr.source === MarkdownSource.Page ? 'pages' : null

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
        source: post.source as PostOrPage,
        subject: post.subject,
        content: post.content,
        tags: post.tags,
        link: post.link,
        createdAt: post.createdAt,
        updatedAt: post.updatedAt,
        outgoing_links: post.outgoingLinks ? JSON.stringify(post.outgoingLinks) : undefined,
      })),
    )
  },
})
