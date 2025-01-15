import { createPrisma, MarkdownSource } from '.'

interface MaybeTag { id?: number, name: string }

export function addPost(env: Env, subject: string, content: string, tags: MaybeTag[] = []) {
  return createPrisma(env.DB).markdown.create({
    data: {
      source: MarkdownSource.Post,
      subject,
      content,
      tags: {
        connect: tags.filter(i => i.id),
        create: tags.filter(i => !i.id),
      },
    },
  })
}

export function updatePost(env: Env, id: number, subject: string, content: string, tags: MaybeTag[] = []) {
  return createPrisma(env.DB).markdown.update({
    where: {
      id,
    },
    data: {
      subject,
      content,
      updatedAt: new Date(),
      tags: {
        connect: tags.filter(i => i.id),
        create: tags.filter(i => !i.id),
      },
    },
  })
}

export function deletePost(env: Env, id: number) {
  return createPrisma(env.DB).markdown.update({
    where: {
      id,
    },
    data: {
      deleted: true,
    },
  })
}

/**
 * @param env CloudFlare Env
 * @param tagId query by tag id
 * @param pagination query pagination params, default read all
 * @param pagination.pageSize read all if 0
 * @param pagination.pageNum read all if 0
 */
export function readPostList(env: Env, tagId?: number, pagination: { pageSize?: number, pageNum?: number } = {}) {
  const { pageSize = 0, pageNum = 0 } = pagination
  const paginationQuery: { take?: number, skip?: number } = {}
  if (pageSize && pageNum) {
    paginationQuery.take = pageSize
    paginationQuery.skip = (pageNum - 1) * pageSize
  }
  return createPrisma(env.DB).markdown.findMany({
    ...paginationQuery,
    where: {
      deleted: false,
      tags: {
        some: {
          id: tagId,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
    include: {
      tags: true,
    },
  })
}

export function readPost(env: Env, subject: string) {
  return createPrisma(env.DB).markdown.findUniqueOrThrow({
    where: {
      source: MarkdownSource.Post,
      subject,
    },
  })
}

export function readTagList(env: Env) {
  return createPrisma(env.DB).tag.findMany()
}
