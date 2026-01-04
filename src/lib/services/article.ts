import type { ValidRedirectStatus } from 'astro'
import { MarkdownSource, type PostOrPage } from '@/db'
import { read } from '@/db/markdown'
import { to } from 'await-to-js'

interface AppInject {
  locals: App.Locals
  redirect: (path: string, status?: ValidRedirectStatus) => Response
  url: URL
}

export async function readArticle({ locals, redirect, url }: AppInject, source: PostOrPage, link: string) {
  const env = locals.runtime?.env || {}
  const prefix = source === MarkdownSource.Post ? 'post/' : source === MarkdownSource.Memo ? 'memo/' : ''
  const [error, article] = await to(read(env, source, `${prefix}${link}`))

  if (error) {
    return redirect('/500')
  }
  else if (!article) {
    return redirect(`/404?source=${encodeURIComponent(url.pathname)}&no-article`)
  }

  return article
}
