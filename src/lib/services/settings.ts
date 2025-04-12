import type { Context } from './editor'
import z from 'zod'
import { putGlobalConfig } from '../kv'

const SettingsSchema = z.object({
  title: z.string().min(1, 'Title is required'),
})

export async function settingsHandler({ request, locals }: Context) {
  if (request.method === 'POST') {
    const data = await request.formData()
    const form = await SettingsSchema.parseAsync(Object.fromEntries(data))

    const env = locals.runtime?.env || {}
    await putGlobalConfig(env, {
      title: form.title,
    })

    return 'ok'
  }
  return null
}
