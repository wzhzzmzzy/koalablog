import { getRenderCandidates, saveRender } from '@/db/rss'
import { md } from '@/lib/markdown'

export async function processMarkdownRenders(env: Env) {
  // 1. Find candidates (up to 5)
  const candidates = await getRenderCandidates(env, 5)

  if (candidates.length === 0) {
    return { message: 'No posts to render', details: [] }
  }

  // 2. Render and save
  const results = []
  const mdInstance = await md()

  for (const post of candidates) {
    try {
      const content = post.content || ''
      const rendered = await mdInstance.render(content)

      await saveRender(env, post.id, rendered)

      results.push({ id: post.id, status: 'success' })
    }
    catch (error) {
      console.error(`Failed to render post ${post.id}:`, error)
      results.push({ id: post.id, status: 'error', error: String(error) })
    }
  }

  return {
    message: `Processed ${results.length} posts`,
    details: results,
  }
}
