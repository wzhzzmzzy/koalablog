import type { PostOrPage, PresetSource } from '.'
import { kebabCase } from 'es-toolkit'
import { createPrisma, MarkdownSource } from '.'

interface MaybeTag { id?: number, name: string }

function linkGenerator(source: PostOrPage, subject: string) {
  let link = kebabCase(subject)
  if (source === MarkdownSource.Post) {
    link = `post/${link}`
  }
  return link
}

export function add(
  env: Env,
  source: PostOrPage,
  subject: string,
  content: string,
  tags: MaybeTag[] = [],
) {
  return createPrisma(env.DB).markdown.create({
    data: {
      link: linkGenerator(source, subject),
      source,
      subject,
      content,
      tags: {
        connect: tags.filter(i => i.id),
        create: tags.filter(i => !i.id),
      },
    },
  })
}

export function update(
  env: Env,
  id: number,
  link: string,
  subject: string,
  content: string,
  tags: MaybeTag[] = [],
) {
  return createPrisma(env.DB).markdown.update({
    where: {
      id,
    },
    data: {
      link,
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

export function remove(env: Env, id: number) {
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
 * @param source MarkdownSource
 * @param tagId query by tag id
 * @param pagination query pagination params, default read all
 * @param pagination.pageSize read all if 0
 * @param pagination.pageNum read all if 0
 */
export function readList(env: Env, source: PostOrPage, tagId?: number, pagination: { pageSize?: number, pageNum?: number } = {}) {
  const { pageSize = 0, pageNum = 0 } = pagination
  const paginationQuery: { take?: number, skip?: number } = {}
  if (pageSize && pageNum) {
    paginationQuery.take = pageSize
    paginationQuery.skip = (pageNum - 1) * pageSize
  }
  const tagQuery = tagId
    ? {
        tags: {
          some: {
            id: tagId,
          },
        },
      }
    : {}
  return createPrisma(env.DB).markdown.findMany({
    ...paginationQuery,
    where: {
      source,
      deleted: false,
      ...tagQuery,
    },
    orderBy: {
      createdAt: 'desc',
    },
    include: {
      tags: true,
    },
  })
}

export function read(env: Env, source: PostOrPage, link: string) {
  return createPrisma(env.DB).markdown.findUniqueOrThrow({
    where: {
      source,
      link,
    },
  })
}

export function readTagList(env: Env) {
  return createPrisma(env.DB).tag.findMany()
}

export function readPreset(env: Env, source: PresetSource[]) {
  return createPrisma(env.DB).markdown.findMany({
    where: {
      source: {
        in: source,
      },
    },
    orderBy: {
      source: 'desc',
    },
  })
}
