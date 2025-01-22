import { env } from 'cloudflare:test'
import { assert, describe, expect, it } from 'vitest'
import { connectDB, MarkdownSource } from '.'
import { add } from './markdown'

describe('add post', async () => {
  const prisma = connectDB(env.DB)
  const mockPost = { subject: 'Post 1', content: '# Post 1\n\n## Content' }
  const mockTag = { name: 'mockData' }

  it('shouldn\'t have any posts and tags', async () => {
    const postList = await prisma.markdown.findMany({
      where: {
        source: MarkdownSource.Post,
      },
    })
    expect(postList).toHaveLength(0)
    const tag1 = await prisma.tag.findFirst({
      where: {
        name: mockTag.name,
      },
    })
    expect(tag1).toBe(null)
  })

  it('should add a post with new tag', async () => {
    await add(env, MarkdownSource.Post, mockPost.subject, mockPost.content, [mockTag])

    const post1 = await prisma.markdown.findFirst({
      where: {
        subject: mockPost.subject,
      },
      include: {
        tags: true,
      },
    })

    const newTag1 = await prisma.tag.findFirst({
      where: {
        name: mockTag.name,
      },
    })

    expect(post1).not.toBe(null)
    expect(post1).toMatchObject(mockPost)
    expect(post1?.tags).toHaveLength(1)
    expect(post1?.tags[0]).toMatchObject(mockTag)

    expect(newTag1).toMatchObject(mockTag)
  })

  it('should add a new post with new tag and existed tag', async () => {
    const data = await prisma.tag.create({ data: mockTag })
    expect(data).toMatchObject({ id: 1, ...mockTag })

    await add(env, MarkdownSource.Post, 'Post 2', '## Mock post', [data, { name: 'mockData2' }])
    const tags = await prisma.tag.findMany()
    expect(tags).toHaveLength(2)
  })
})
