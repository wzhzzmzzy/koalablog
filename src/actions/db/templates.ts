import type { TemplateCatalogV1, TemplateCatalogV2 } from '@/lib/files/types'
import { readTemplateCatalog, replaceTemplateCatalog } from '@/db/template-catalog'
import { upgradeTemplateCatalogV1 } from '@/lib/files/template'
import { RENDERER_MODE } from '@/lib/files/types'
import { ActionError, defineAction } from 'astro:actions'
import { z } from 'astro:schema'
import { authGuard } from '../utils/auth'

const templateSchema = z.object({
  id: z.string().min(1),
  prefix: z.string(),
  titlePattern: z.string(),
  pathPattern: z.string(),
  renderer: z.enum([RENDERER_MODE.Markdown, RENDERER_MODE.Svelte]),
  content: z.string(),
}).strict()

function asCatalogV2(catalog: TemplateCatalogV1 | TemplateCatalogV2): TemplateCatalogV2 {
  return catalog.schemaVersion === 2 ? catalog : upgradeTemplateCatalogV1(catalog)
}

export const read = defineAction({
  accept: 'json',
  handler: async (_, ctx) => {
    await authGuard(ctx)
    const result = await readTemplateCatalog(ctx.locals.runtime?.env)
    if (result.status === 'absent')
      return result
    return { status: 'ready' as const, catalog: asCatalogV2(result.catalog) }
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
