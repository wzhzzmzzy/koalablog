import { readTemplateCatalog, replaceTemplateCatalog } from '@/db/template-catalog'
import { ActionError, defineAction } from 'astro:actions'
import { z } from 'astro:schema'
import { authGuard } from '../utils/auth'

const templateSchema = z.object({
  id: z.string().min(1),
  prefix: z.string(),
  titlePattern: z.string(),
  pathPattern: z.string(),
  content: z.string(),
}).strict()

export const read = defineAction({
  accept: 'json',
  handler: async (_, ctx) => {
    await authGuard(ctx)
    return readTemplateCatalog(ctx.locals.runtime?.env)
  },
})

export const replace = defineAction({
  accept: 'json',
  input: z.object({
    baseRevision: z.number().int().positive(),
    templates: z.array(templateSchema),
  }).strict(),
  handler: async (input, ctx) => {
    await authGuard(ctx)
    const result = await replaceTemplateCatalog(ctx.locals.runtime?.env, input.baseRevision, input.templates)
    if (result.status === 'conflict') {
      throw new ActionError({
        code: 'CONFLICT',
        message: JSON.stringify({
          code: 'template_catalog_conflict',
          currentRevision: result.currentRevision,
        }),
      })
    }
    return result.catalog
  },
})
