import type { Markdown } from '@/db/types'
import { MarkdownSource } from '@/db'
import { justReadAll, updateRefs as updateRefsDB } from '@/db/markdown'
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

export const save = defineAction({
  input: z.object({
    subject: z.string(),
    content: z.string(),
    outgoingLinks: z.array(z.object({
      subject: z.string(),
      link: z.string(),
    })).default([]),
  }),
  handler: async (_input, _ctx) => {
    // const post = await add(ctx.locals.runtime?.env, MarkdownSource.Post, input.subject, input.content)
    //
    // return post
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
