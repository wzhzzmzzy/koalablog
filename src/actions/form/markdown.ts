import { MarkdownSource } from '@/db'
import { add, addPreset, remove as removeMarkdown, update } from '@/db/markdown'
import { ActionError, defineAction } from 'astro:actions'
import { z } from 'astro:schema'

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
  }).refine((val) => {
    if (val.source === MarkdownSource.Post) {
      return val.link.startsWith('post/')
    }
    return true
  }, 'invalid link'),
  handler: async (input, ctx) => {
    const { id, link, subject, content, source } = input
    const env = ctx.locals.runtime?.env || {}
    if (id) {
      await update(env, id, link, subject, content)
      return { link }
    }
    else if (source === MarkdownSource.Page || source === MarkdownSource.Post) {
      await add(env, source, subject, content, link)
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
    _action: z.literal('delete'),
  }),
  handler: async (input, ctx) => {
    const env = ctx.locals.runtime?.env || {}
    await removeMarkdown(env, input.id)
  },
})
