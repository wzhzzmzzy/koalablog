import type { Context } from './editor'
import z from 'zod'

const SettingsSchema = z.object({
  title: z.string().min(1, 'Title is required'),
})

export async function settingsHandler({ request, locals }: Context) {
  if (request.method === 'POST') {
    const data = await request.formData()
    const form = await SettingsSchema.parseAsync(Object.fromEntries(data))

    await locals.runtime.env.KOALA.put('title', form.title)

    return 'ok'
  }
  return null
}
