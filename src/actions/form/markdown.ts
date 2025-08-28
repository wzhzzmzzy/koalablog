import { MarkdownSource } from '@/db'
import { add, addPreset, remove as removeMarkdown, update } from '@/db/markdown'
import { parseJson } from '@/lib/utils/parse-json'
import { ActionError, defineAction } from 'astro:actions'
import { z } from 'astro:schema'
import { authGuard } from '../utils/auth'

export const save = defineAction({
  accept: 'form',
  input: z.object({
    source: z.preprocess(Number, z.nativeEnum(MarkdownSource)),
    id: z.preprocess(
      a => Number.parseInt(a as string, 10),
      z.number().gte(0),
    ),
    link: z.string().min(1),
    subject: z.string().min(1),
    content: z.string(),
    outgoingLinks: z.preprocess(
      o => parseJson(o as string || null),
      z.array(z.object({
        subject: z.string(),
        link: z.string(),
      })).default([]),
    ).default([]),
    private: z.boolean().default(false),
  }).refine((val) => {
    if (val.source === MarkdownSource.Post) {
      return val.link.startsWith('post/')
    }
    return true
  }, 'invalid link'),
  handler: async (input, ctx) => {
    await authGuard(ctx)

    const { id, link, subject, content, source, outgoingLinks, private: privated } = input
    const env = ctx.locals.runtime?.env || {}
    if (id) {
      await update(env, id, link, subject, content, JSON.stringify(outgoingLinks), privated)
      return { link }
    }
    else if (source === MarkdownSource.Page || source === MarkdownSource.Post) {
      await add(env, source, subject, content, link, JSON.stringify(outgoingLinks), privated)
      return { link }
    }
    else if (source === MarkdownSource.Home || source === MarkdownSource.Nav) {
      await addPreset(env, link, source, subject, content)
    }
    else {
      throw new ActionError({
        message: `Preset page source '${source}' cannot be create`,
        code: 'BAD_REQUEST',
      })
    }
  },
})

export const remove = defineAction({
  accept: 'form',
  input: z.object({
    id: z.preprocess(
      a => Number.parseInt(a as string, 10),
      z.number().gt(0),
    ),
    link: z.string(),
    _action: z.literal('delete'),
  }),
  handler: async (input, ctx) => {
    await authGuard(ctx)

    const env = ctx.locals.runtime?.env || {}
    await removeMarkdown(env, input.id, input.link)
  },
})
