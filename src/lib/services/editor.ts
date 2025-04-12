import { MarkdownSource } from '@/db'
import { add, addPreset, update } from '@/db/markdown'
import z from 'zod'

const FormSchema = z.object({
  id: z.preprocess(
    a => Number.parseInt(a as string, 10),
    z.number().gte(0),
  ),
  link: z.string().min(1),
  subject: z.string().min(1),
  content: z.string(),
})

export interface Context { request: Request, locals: App.Locals }
export async function formHandler({ request, locals }: Context, { source }: { source: MarkdownSource }) {
  if (request.method === 'POST') {
    const data = await request.formData()

    const form = await FormSchema.parseAsync(Object.fromEntries(data))
    const env = locals.runtime?.env || {}
    if (form.id) {
      await update(env, form.id, form.link, form.subject, form.content)
    }
    else if (source === MarkdownSource.Page || source === MarkdownSource.Post) {
      await add(env, source, form.subject, form.content)
    }
    else if (source === MarkdownSource.Home || source === MarkdownSource.Nav) {
      await addPreset(env, form.link, source, form.subject, form.content)
    }
    else {
      throw new Error(`Preset page source '${source}' cannot be create`)
    }
    return 'ok'
  }
  return null
}
