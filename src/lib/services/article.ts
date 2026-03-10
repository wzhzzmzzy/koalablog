import type { ValidRedirectStatus } from 'astro'
import { MarkdownSource } from '@/db'
import { read } from '@/db/markdown'
import { to } from 'await-to-js'

interface AppInject {
  locals: App.Locals
  redirect: (path: string, status?: ValidRedirectStatus) => Response
  url: URL
}

export async function readArticle({ locals, redirect, url }: AppInject, source: MarkdownSource, link: string) {
  const env = locals.runtime?.env || {}
  let prefix = source === MarkdownSource.Post ? 'post/' : source === MarkdownSource.Memo ? 'memo/' : ''
  // special case, for memos/
  if (link.startsWith('memos')) {
    prefix = ''
  }
  const [error, article] = await to(read(env, source, `${prefix}${link}`))

  if (error) {
    return redirect('/500')
  }
  else if (!article) {
    return redirect(`/404?source=${encodeURIComponent(url.pathname)}&no-article`)
  }

  if (article.private) {
    if (!locals.session?.role) {
      return redirect(`/guest-login?id=${article.id}`)
    }
  }

  return article
}
