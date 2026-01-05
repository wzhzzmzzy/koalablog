import { defineAction } from 'astro:actions'
import { z } from 'astro:schema'
import { authGuard, guards, ossGuard } from '../utils/auth'

const sourceEnum = z.enum(['article', 'post', 'page', 'oss'])

export const upload = defineAction({
  accept: 'form',
  input: z.object({
    source: sourceEnum,
    name: z.string().optional(),
    file: z.instanceof(File),
  }),
  handler: async (input, ctx) => {
    await guards([authGuard(ctx), ossGuard(ctx)])

    const { file, source, name } = input

    const fileName = name || `upload-${Date.now()}`
    const key = `${source}/${fileName}`

    const OSS = ctx.locals.OSS || ctx.locals.runtime.env.OSS
    await OSS.put(key, file, {
      httpMetadata: {
        contentType: file.type,
      },
      customMetadata: {
        uploadedAt: new Date().toISOString(),
        originalName: file.name,
        size: file.size.toString(),
      },
    })

    return key
  },
})

export const remove = defineAction({
  accept: 'json',
  input: z.array(z.union([
    z.object({ key: z.string() }),
    z.object({ source: sourceEnum, fileName: z.string().min(1) }),
  ])).min(1),
  handler: async (input, ctx) => {
    await guards([authGuard(ctx)])

    const keyList = input.map((item) => {
      let key = ''
      if ('key' in item) {
        key = item.key
      }
      else {
        key = `${item.source}/${item.fileName}`
      }

      return key
    })

    const OSS = ctx.locals.OSS || ctx.locals.runtime.env.OSS
    return OSS.delete(keyList)
  },
})

export const list = defineAction({
  handler: async (_, ctx) => {
    await guards([authGuard(ctx), ossGuard(ctx)])

    const OSS = ctx.locals.OSS || ctx.locals.runtime.env.OSS
    return OSS.list()
  },
})
