import type { ValidRedirectStatus } from 'astro'
import { MarkdownSource, type PostOrPage } from '@/db'
import { read } from '@/db/markdown'
import { to } from 'await-to-js'

interface AppInject { locals: App.Locals, redirect: (path: string, status?: ValidRedirectStatus) => Response }

export async function readArticle({ locals, redirect }: AppInject, source: PostOrPage, link: string) {
  const env = locals.runtime?.env || {}
  const [error, article] = await to(read(env, source, `${source === MarkdownSource.Post ? 'post/' : ''}${link}`))

  if (error) {
    return redirect('/500')
  }
  else if (!article) {
    return redirect('/404')
  }

  return article
}
