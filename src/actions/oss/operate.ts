import { defineAction } from 'astro:actions'
import { z } from 'astro:schema'

const sourceEnum = z.enum(['post', 'page', 'preset'])

export const upload = defineAction({
  accept: 'form',
  input: z.object({
    source: sourceEnum,
    file: z.instanceof(File),
  }),
  handler: async (input, ctx) => {
    const { file, source } = input

    const fileName = file.name || `upload-${Date.now()}`
    const key = `${source}/${fileName}`

    await ctx.locals.runtime.env.OSS.put(key, file, {
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
  handler: (input, ctx) => {
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

    return ctx.locals.runtime.env.OSS.delete(keyList)
  },
})

export const list = defineAction({
  handler: (_, ctx) => {
    return ctx.locals.runtime.env.OSS.list()
  },
})
