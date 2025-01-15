import { createPrisma, MarkdownSource, MarkdownSubjectMap } from '.'

export function readPresetSource(env: Env, source: MarkdownSource[]) {
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

export function editPresetSource(env: Env, source: MarkdownSource.Home | MarkdownSource.Nav, content: string) {
  return createPrisma(env.DB).markdown.update({
    where: {
      source,
      subject: MarkdownSubjectMap[source] ?? 'Unknown',
    },
    data: {
      content,
    },
  })
}

export function readPage(env: Env, subject: string) {
  return createPrisma(env.DB).markdown.findUniqueOrThrow({
    where: {
      source: MarkdownSource.Page,
      subject,
    },
  })
}
