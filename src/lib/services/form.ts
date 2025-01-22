import { MarkdownSource } from '@/db'
import { add, update } from '@/db/markdown'
import { to } from 'await-to-js'
import z from 'zod'

class ValidationError extends Error {
  errors: Record<string, string>

  constructor(message: string, errors: Record<string, string> = {}) {
    super(message)
    this.name = 'ValidationError'
    this.errors = errors

    // 这行代码是为了确保 instanceof 操作符能正常工作
    Object.setPrototypeOf(this, ValidationError.prototype)
  }
}

const FormSchema = z.object({
  id: z.preprocess(
    a => Number.parseInt(a as string, 10),
    z.number().gte(0),
  ),
  link: z.string().default(''),
  subject: z.string().min(1),
  content: z.string(),
})

interface Context { request: Request, locals: App.Locals }
export async function formHandler({ request, locals }: Context, { source }: { source: MarkdownSource }) {
  if (request.method === 'POST') {
    const data = await request.formData()
    const [parseError, form] = await to(
      FormSchema.parseAsync(Object.fromEntries(data)),
    )
    if (parseError) {
      throw new ValidationError('form validation failed')
    }
    if (form.id) {
      await update(locals.runtime.env, form.id, form.link, form.subject, form.content)
    }
    else if (source === MarkdownSource.Page || source === MarkdownSource.Post) {
      const newPost = await add(locals.runtime.env, source, form.subject, form.content)
      console.log(newPost)
    }
    else {
      throw new Error(`Preset page source '${source}' cannot be create`)
    }
    return 'ok'
  }
  return null
}
